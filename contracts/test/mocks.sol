// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { ISwapRouter02 } from "../src/interfaces/IUniswap.sol";

contract MockERC20 is ERC20 {
    uint8 private immutable _decimals;

    constructor(string memory name_, string memory symbol_, uint8 decimals_) ERC20(name_, symbol_) {
        _decimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

/// @notice Minimal Uniswap V3 pool stand-in with a settable price.
contract MockV3Pool {
    address public immutable token0;
    address public immutable token1;
    uint24 public immutable fee;

    uint160 public sqrtPriceX96;
    int24 public tick;

    constructor(address token0_, address token1_, uint24 fee_, uint160 sqrtPriceX96_) {
        token0 = token0_;
        token1 = token1_;
        fee = fee_;
        sqrtPriceX96 = sqrtPriceX96_;
    }

    function setPrice(uint160 sqrtPriceX96_, int24 tick_) external {
        sqrtPriceX96 = sqrtPriceX96_;
        tick = tick_;
    }

    function slot0()
        external
        view
        returns (
            uint160,
            int24,
            uint16,
            uint16,
            uint16,
            uint8,
            bool
        )
    {
        return (sqrtPriceX96, tick, 0, 0, 0, 0, true);
    }
}

/// @notice Router stand-in: pays out `mockAmountOut` of tokenOut, enforcing the slippage floor.
contract MockSwapRouter {
    uint256 public mockAmountOut;

    function setMockAmountOut(uint256 amountOut_) external {
        mockAmountOut = amountOut_;
    }

    function exactInputSingle(ISwapRouter02.ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut)
    {
        require(mockAmountOut >= params.amountOutMinimum, "Too little received");
        // Pull tokenIn like the real router does via permit2/transferFrom path.
        MockERC20(params.tokenIn).transferFrom(msg.sender, address(this), params.amountIn);
        MockERC20(params.tokenOut).mint(params.recipient, mockAmountOut);
        return mockAmountOut;
    }
}
