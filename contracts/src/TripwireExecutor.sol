// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import { SafeERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ReentrancyGuard } from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import { IUniswapV3Pool, ISwapRouter02 } from "./interfaces/IUniswap.sol";

/**
 * @title TripwireExecutor
 * @notice Keeper-less stop-loss / take-profit orders for Uniswap V3 pools.
 * @dev Escrows the sell-side tokens at order creation. Execution happens only
 *      through a Reactive Omni callback whose originating contract address is
 *      pinned at construction. The callback re-reads the pool price from
 *      `slot0()` and enforces the order's trigger, armed state and deadline
 *      before swapping. The contract holds no admin, upgrade, pause, fee,
 *      escrow-beyond-orders or rescue path. Direct token transfers are not
 *      recoverable.
 *
 *      Orders are one-shot: the first valid callback fills the order and
 *      clears `armed`. If the Reactive contract marks an order fired but the
 *      callback reverts (e.g. slippage), the order stays escrowed; the owner
 *      can reclaim the tokens with `cancelOrder`.
 */
contract TripwireExecutor is ReentrancyGuard {
    using SafeERC20 for IERC20;

    /// @notice Callback proxy on this chain (Reactive Network per-chain delivery proxy).
    address public immutable CALLBACK_PROXY;
    /// @notice Reactive contract on Lasna that is authorized to trigger executions.
    address public immutable REACTIVE_SENDER;
    /// @notice Uniswap V3 SwapRouter02 on this chain.
    address public immutable ROUTER;

    struct Order {
        address owner;
        address recipient;
        address pool;
        address sellToken;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 triggerSqrtPriceX96;
        bool fireAbove;
        uint64 deadline;
        bool armed;
    }

    /// @notice Auto-incrementing order id. Order ids start at 1.
    uint256 public nextOrderId = 1;
    /// @notice orderId => order
    mapping(uint256 => Order) public orders;
    /// @notice owner => orderIds (monotonic, ids of cancelled/filled orders remain)
    mapping(address => uint256[]) private _orderIdsOf;

    /// @notice Full event payload is consumed by the TripwireReactive contract on Lasna.
    event OrderCreated(
        uint256 indexed orderId,
        address indexed owner,
        address pool,
        address sellToken,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 triggerSqrtPriceX96,
        bool fireAbove,
        uint64 deadline,
        address recipient
    );
    event OrderCancelled(uint256 indexed orderId, address indexed owner, uint256 refunded);
    event OrderExecuted(uint256 indexed orderId, address indexed owner, uint160 sqrtPriceX96, uint256 amountOut);
    /// @notice Emitted when a valid callback arrives but the order cannot fill (no revert, no gas waste on destination beyond the call).
    event OrderSkipped(uint256 indexed orderId, string reason);

    error NotOwner();
    error NotArmed();
    error CallbackProxyOnly();
    error ReactiveSenderOnly();
    error InvalidPool();
    error SellTokenNotInPool();
    error BadOrder();

    constructor(address callbackProxy_, address reactiveSender_, address router_) {
        if (callbackProxy_ == address(0) || reactiveSender_ == address(0) || router_ == address(0)) revert BadOrder();
        CALLBACK_PROXY = callbackProxy_;
        REACTIVE_SENDER = reactiveSender_;
        ROUTER = router_;
    }

    /**
     * @notice Arm a new order. Escrows `amountIn` of `sellToken` and approves the router.
     * @param pool Address of the Uniswap V3 pool to watch (validated via a static `slot0()` call).
     * @param sellToken Token to sell; must be `token0` or `token1` of `pool`.
     * @param amountIn Exact amount of `sellToken` escrowed and swapped on trigger.
     * @param amountOutMinimum Slippage floor enforced by the router on execution.
     * @param triggerSqrtPriceX96 Fire threshold expressed in pool `sqrtPriceX96` units.
     * @param fireAbove If true, fire when `sqrtPriceX96 >= trigger`; else when `<=`.
     * @param deadline Unix timestamp after which the order can no longer execute.
     * @param recipient Destination of proceeds (usually the owner; can differ, e.g. a vault).
     */
    function createOrder(
        address pool,
        address sellToken,
        uint256 amountIn,
        uint256 amountOutMinimum,
        uint160 triggerSqrtPriceX96,
        bool fireAbove,
        uint64 deadline,
        address recipient
    ) external nonReentrant returns (uint256 orderId) {
        _validatePool(pool, sellToken);
        if (amountIn == 0 || deadline <= block.timestamp || recipient == address(0)) revert BadOrder();
        if (triggerSqrtPriceX96 == 0) revert BadOrder();

        orderId = nextOrderId++;
        orders[orderId] = Order({
            owner: msg.sender,
            recipient: recipient,
            pool: pool,
            sellToken: sellToken,
            amountIn: amountIn,
            amountOutMinimum: amountOutMinimum,
            triggerSqrtPriceX96: triggerSqrtPriceX96,
            fireAbove: fireAbove,
            deadline: deadline,
            armed: true
        });
        _orderIdsOf[msg.sender].push(orderId);

        IERC20(sellToken).safeTransferFrom(msg.sender, address(this), amountIn);
        IERC20(sellToken).forceApprove(ROUTER, amountIn);

        emit OrderCreated(
            orderId,
            msg.sender,
            pool,
            sellToken,
            amountIn,
            amountOutMinimum,
            triggerSqrtPriceX96,
            fireAbove,
            deadline,
            recipient
        );
    }

    /// @notice Cancel an armed order and refund the escrowed tokens.
    function cancelOrder(uint256 orderId) external nonReentrant {
        Order storage o = orders[orderId];
        if (o.owner != msg.sender) revert NotOwner();
        if (!o.armed) revert NotArmed();
        o.armed = false;
        IERC20(o.sellToken).forceApprove(ROUTER, 0);
        IERC20(o.sellToken).safeTransfer(o.owner, o.amountIn);
        emit OrderCancelled(orderId, msg.sender, o.amountIn);
    }

    /**
     * @notice Execution entry point, reachable only via the Reactive callback proxy.
     * @param reactive_ Address injected by the proxy; must equal REACTIVE_SENDER.
     * @param orderId Order to evaluate and, if still crossed, fill.
     */
    function execute(address reactive_, uint256 orderId) external onlyCallback nonReentrant {
        if (reactive_ != REACTIVE_SENDER) revert ReactiveSenderOnly();

        Order storage o = orders[orderId];
        if (!o.armed) {
            emit OrderSkipped(orderId, "not-armed");
            return;
        }
        if (block.timestamp > o.deadline) {
            emit OrderSkipped(orderId, "expired");
            return;
        }

        (uint160 sqrtPriceX96,,,,,,) = IUniswapV3Pool(o.pool).slot0();
        bool crossed = o.fireAbove ? sqrtPriceX96 >= o.triggerSqrtPriceX96 : sqrtPriceX96 <= o.triggerSqrtPriceX96;
        if (!crossed) {
            emit OrderSkipped(orderId, "not-crossed");
            return;
        }

        o.armed = false;

        address token0 = IUniswapV3Pool(o.pool).token0();
        address token1 = IUniswapV3Pool(o.pool).token1();
        address tokenOut = o.sellToken == token0 ? token1 : token0;
        uint24 fee = IUniswapV3Pool(o.pool).fee();

        uint256 amountOut = ISwapRouter02(ROUTER).exactInputSingle(
            ISwapRouter02.ExactInputSingleParams({
                tokenIn: o.sellToken,
                tokenOut: tokenOut,
                fee: fee,
                recipient: o.recipient,
                amountIn: o.amountIn,
                amountOutMinimum: o.amountOutMinimum,
                sqrtPriceLimitX96: 0
            })
        );

        emit OrderExecuted(orderId, o.owner, sqrtPriceX96, amountOut);
    }

    /// @notice Ids of all orders ever created by `owner_` (armed or not).
    function ordersOf(address owner_) external view returns (uint256[] memory) {
        return _orderIdsOf[owner_];
    }

    /// @notice Number of orders created so far.
    function orderCount() external view returns (uint256) {
        return nextOrderId - 1;
    }

    function _validatePool(address pool, address sellToken) internal view {
        if (pool.code.length == 0) revert InvalidPool();
        (bool ok0, bytes memory ret0) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.token0.selector));
        (bool ok1, bytes memory ret1) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.token1.selector));
        (bool okP, bytes memory retP) = pool.staticcall(abi.encodeWithSelector(IUniswapV3Pool.slot0.selector));
        if (!ok0 || !ok1 || !okP) revert InvalidPool();
        if (retP.length < 32 * 7) revert InvalidPool();
        address token0 = abi.decode(ret0, (address));
        address token1 = abi.decode(ret1, (address));
        if (sellToken != token0 && sellToken != token1) revert SellTokenNotInPool();
    }

    modifier onlyCallback() {
        if (msg.sender != CALLBACK_PROXY) revert CallbackProxyOnly();
        _;
    }
}
