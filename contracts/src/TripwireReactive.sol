// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IReactive } from "@reactive/src/interfaces/IReactive.sol";
import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";
import { AbstractReactive } from "@reactive/src/base/AbstractReactive.sol";

/**
 * @title TripwireReactive
 * @notice Reactive Omni order engine watching Uniswap V3 pools on origin chains.
 * @dev Deployed on Reactive Lasna (chain id 5318007). Maintains a bounded order
 *      book synced from `TripwireExecutor` lifecycle events (`OrderCreated` /
 *      `OrderCancelled`) instead of trusting any external price feed. On every
 *      watched `Swap` event it re-evaluates armed orders for that chain+pool
 *      and requests a callback to the executor when a trigger is crossed.
 *
 *      Design rules:
 *      - The reactive contract never trusts a callback to move funds; the
 *        executor re-verifies price, armed state and deadline on-chain.
 *      - One-shot semantics: an order is marked fired before the callback is
 *        requested, so repeated swaps never double-fire.
 *      - Bounded book: at most MAX_ORDERS armed keys per pool, enforced at
 *        insertion. Keeping the book small keeps `react()` below the reactive
 *        transaction gas cap.
 *      - No funds custody beyond operational lREACT reserves; anyone can
 *        settle debt with `coverDebt()` (inherited from AbstractPayer).
 */
contract TripwireReactive is AbstractReactive {
    uint256 public constant SWAP_TOPIC0 = 0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67;
    uint256 public constant ORDER_CREATED_TOPIC0 = 0x69abf29ff4b038bda1034084e3a365f6e3d01104101fdd5af80372000b4c5fe1;
    uint256 public constant ORDER_CANCELLED_TOPIC0 = 0xa4bb54ffb7bcc3eb7bdd81e41ad340b367a9b3a7416cd7764e68713a274c9da3;

    /// @notice Armed order keys tracked per chain+pool.
    uint256 public constant MAX_ORDERS_PER_POOL = 64;

    /// @notice Deployer; sole authority over wiring (pools and executors). Can never touch funds or orders.
    address public immutable OWNER;

    /// @notice chainId => executor contract address (set once per chain).
    mapping(uint256 => address) public executorOf;

    struct Order {
        uint256 orderId;
        address pool;
        uint160 triggerSqrtPriceX96;
        bool fireAbove;
        uint64 deadline;
        bool fired;
    }

    /// @notice key = keccak256(abi.encode(chainId, orderId))
    mapping(bytes32 => Order) public orders;
    /// @notice keccak256(abi.encode(chainId, pool)) => order keys (keys are never removed; exhausted orders are skipped)
    mapping(bytes32 => bytes32[]) private _bookOf;

    event PoolAdded(uint256 chainId, address pool);
    event ExecutorAdded(uint256 chainId, address executor);
    event OrderArmed(bytes32 key, uint256 chainId, uint256 orderId, address pool, uint160 triggerSqrtPriceX96, bool fireAbove, uint64 deadline);
    event OrderDisarmed(bytes32 key, uint256 chainId, uint256 orderId);
    event TripwireFired(bytes32 key, uint256 chainId, uint256 orderId);

    error OnlyOwner();
    error ExecutorAlreadySet();
    error PoolBookFull();

    constructor() payable {
        OWNER = msg.sender;
    }

    /// @notice Watch a Uniswap V3 pool's Swap events on an origin chain.
    function addPool(uint256 chainId, address pool) external {
        if (msg.sender != OWNER) revert OnlyOwner();
        SYSTEM.subscribe(chainId, pool, SWAP_TOPIC0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        emit PoolAdded(chainId, pool);
    }

    /**
     * @notice Pin the executor for an origin chain and subscribe to its lifecycle events.
     * @dev Set once per chain. Cannot be changed afterwards so the callback target is immutable in practice.
     */
    function addExecutor(uint256 chainId, address executor) external {
        if (msg.sender != OWNER) revert OnlyOwner();
        if (executorOf[chainId] != address(0)) revert ExecutorAlreadySet();
        executorOf[chainId] = executor;
        SYSTEM.subscribe(chainId, executor, ORDER_CREATED_TOPIC0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        SYSTEM.subscribe(chainId, executor, ORDER_CANCELLED_TOPIC0, REACTIVE_IGNORE, REACTIVE_IGNORE, REACTIVE_IGNORE);
        emit ExecutorAdded(chainId, executor);
    }

    /// @inheritdoc IReactive
    function react(LogRecord memory log_) external onlySystem {
        if (log_.topic0 == ORDER_CREATED_TOPIC0) {
            _handleCreated(log_);
            return;
        }
        if (log_.topic0 == ORDER_CANCELLED_TOPIC0) {
            _handleCancelled(log_);
            return;
        }
        if (log_.topic0 == SWAP_TOPIC0) {
            _handleSwap(log_);
        }
    }

    /// @notice Armed-order keys tracked for a chain+pool (includes already-fired orders; skipped at react time).
    function bookOf(uint256 chainId, address pool) external view returns (bytes32[] memory) {
        return _bookOf[keccak256(abi.encode(chainId, pool))];
    }

    function _handleCreated(LogRecord memory log_) internal {
        uint256 orderId = uint256(log_.topic1);
        // Non-indexed params of OrderCreated, in order.
        (address pool, , , , uint160 triggerSqrtPriceX96, bool fireAbove, uint64 deadline, ) =
            abi.decode(log_.data, (address, address, uint256, uint256, uint160, bool, uint64, address));

        bytes32 key = keccak256(abi.encode(log_.chainId, orderId));
        if (orders[key].orderId != 0) return; // already tracked; duplicate delivery is harmless

        bytes32 poolBookKey = keccak256(abi.encode(log_.chainId, pool));
        if (_bookOf[poolBookKey].length >= MAX_ORDERS_PER_POOL) revert PoolBookFull();

        orders[key] = Order({
            orderId: orderId,
            pool: pool,
            triggerSqrtPriceX96: triggerSqrtPriceX96,
            fireAbove: fireAbove,
            deadline: deadline,
            fired: false
        });
        _bookOf[poolBookKey].push(key);
        emit OrderArmed(key, log_.chainId, orderId, pool, triggerSqrtPriceX96, fireAbove, deadline);
    }

    function _handleCancelled(LogRecord memory log_) internal {
        uint256 orderId = uint256(log_.topic1);
        bytes32 key = keccak256(abi.encode(log_.chainId, orderId));
        Order storage o = orders[key];
        if (o.orderId == 0) return;
        o.fired = true; // exhausts the entry so Swap logs ignore it
        emit OrderDisarmed(key, log_.chainId, orderId);
    }

    function _handleSwap(LogRecord memory log_) internal {
        address executor = executorOf[log_.chainId];
        if (executor == address(0)) return;

        // Uniswap V3 Swap: (int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)
        (, , uint160 sqrtPriceX96, , ) = abi.decode(log_.data, (int256, int256, uint160, uint128, int24));

        bytes32 poolBookKey = keccak256(abi.encode(log_.chainId, log_.contractAddress));
        bytes32[] storage keys = _bookOf[poolBookKey];
        uint256 n = keys.length;
        uint256 nowTs = block.timestamp;

        for (uint256 i = 0; i < n; i++) {
            Order storage o = orders[keys[i]];
            if (o.fired) continue;
            if (nowTs > o.deadline) continue;
            bool crossed = o.fireAbove ? sqrtPriceX96 >= o.triggerSqrtPriceX96 : sqrtPriceX96 <= o.triggerSqrtPriceX96;
            if (!crossed) continue;

            o.fired = true; // one-shot; executor enforces armed state as well

            bytes memory payload = abi.encodeWithSignature("execute(address,uint256)", address(0), o.orderId);
            SYSTEM.requestCallbackV_1_0(
                ISystemContract.CallbackConfiguration_V_1_0({
                    chainId: log_.chainId,
                    recipient: executor,
                    gasLimit: 500000,
                    payload: payload
                })
            );
            emit TripwireFired(keys[i], log_.chainId, o.orderId);
        }
    }
}
