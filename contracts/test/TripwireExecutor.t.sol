// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { TripwireExecutor } from "../src/TripwireExecutor.sol";
import { MockERC20, MockV3Pool, MockSwapRouter } from "./mocks.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TripwireExecutorTest is Test {
    uint160 internal constant SQRT_1000 = 0x10000000000000000000000000000; // 2^112 / sqrt? arbitrary large; replaced per-test
    address internal constant PROXY = address(0x476F44b11F5C942c58f4c8E3d0300E5710743585);
    address internal constant REACTIVE = address(0xCAFE);
    address internal owner = address(0xB0B);
    address internal recipient = address(0xBEEF);

    MockERC20 internal usdc;
    MockERC20 internal weth;
    MockV3Pool internal pool;
    MockSwapRouter internal router;
    TripwireExecutor internal executor;

    uint160 internal priceLow;
    uint160 internal priceHigh;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        weth = new MockERC20("Wrapped Ether", "WETH", 18);
        // token0 < token1 by address sort: pool used for both sell directions
        (address t0, address t1) = address(usdc) < address(weth) ? (address(usdc), address(weth)) : (address(weth), address(usdc));
        priceLow = 1e30; // sqrtPrice below trigger
        priceHigh = 2e30; // sqrtPrice above trigger
        pool = new MockV3Pool(t0, t1, 500, (priceLow + priceHigh) / 2);
        router = new MockSwapRouter();
        executor = new TripwireExecutor(PROXY, REACTIVE, address(router));

        usdc.mint(owner, 1_000_000e6);
        weth.mint(owner, 100e18);
        vm.prank(owner);
        usdc.approve(address(executor), type(uint256).max);
        vm.prank(owner);
        weth.approve(address(executor), type(uint256).max);
    }

    function _sellToken() internal view returns (address) {
        return pool.token0();
    }

    function _createOrder(bool fireAbove, uint160 trigger, uint256 amountIn, uint256 minOut, uint64 deadline)
        internal
        returns (uint256 orderId)
    {
        address sell = _sellToken();
        vm.prank(owner);
        orderId = executor.createOrder(address(pool), sell, amountIn, minOut, trigger, fireAbove, deadline, recipient);
    }

    function test_createOrderEscrowsAndApproves() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 before = IERC20(_sellToken()).balanceOf(address(executor));
        uint256 id = _createOrder(true, priceHigh, 100e6, 0, deadline);
        assertEq(id, 1);
        assertEq(IERC20(_sellToken()).balanceOf(address(executor)), before + 100e6);
        assertEq(IERC20(_sellToken()).allowance(address(executor), address(router)), 100e6);
        (address o, , , , , , , , , bool armed) = executor.orders(id);
        assertEq(o, owner);
        assertTrue(armed);
    }

    function test_createOrderRevertsOnBadInputs() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        address sell = _sellToken();
        vm.startPrank(owner);
        vm.expectRevert(TripwireExecutor.InvalidPool.selector);
        executor.createOrder(address(0xDEAD), sell, 1, 0, priceHigh, true, deadline, recipient);
        vm.expectRevert(TripwireExecutor.SellTokenNotInPool.selector);
        executor.createOrder(address(pool), address(0x1234), 1, 0, priceHigh, true, deadline, recipient);
        vm.expectRevert(TripwireExecutor.BadOrder.selector);
        executor.createOrder(address(pool), sell, 0, 0, priceHigh, true, deadline, recipient);
        vm.expectRevert(TripwireExecutor.BadOrder.selector);
        executor.createOrder(address(pool), sell, 1, 0, priceHigh, true, uint64(block.timestamp), recipient);
        vm.stopPrank();
    }

    function test_cancelOrderRefunds() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = _createOrder(true, priceHigh, 100e6, 0, deadline);
        uint256 before = IERC20(_sellToken()).balanceOf(owner);
        vm.prank(owner);
        executor.cancelOrder(id);
        assertEq(IERC20(_sellToken()).balanceOf(owner), before + 100e6);
        assertEq(IERC20(_sellToken()).allowance(address(executor), address(router)), 0);
        vm.expectRevert(TripwireExecutor.NotArmed.selector);
        vm.prank(owner);
        executor.cancelOrder(id);
    }

    function test_cancelOrderOnlyOwner() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = _createOrder(true, priceHigh, 100e6, 0, deadline);
        vm.prank(address(0xBAD));
        vm.expectRevert(TripwireExecutor.NotOwner.selector);
        executor.cancelOrder(id);
    }

    function test_executeRevertsUnlessProxy() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = _createOrder(true, priceHigh, 100e6, 0, deadline);
        vm.expectRevert(TripwireExecutor.CallbackProxyOnly.selector);
        executor.execute(REACTIVE, id);
    }

    function test_executeRevertsWrongReactive() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint256 id = _createOrder(true, priceHigh, 100e6, 0, deadline);
        vm.prank(PROXY);
        vm.expectRevert(TripwireExecutor.ReactiveSenderOnly.selector);
        executor.execute(address(0xBEEF), id);
    }

    function test_executeNotCrossedSkips() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        // fireAbove with trigger above current price -> not crossed
        uint256 id = _createOrder(true, priceHigh + 1, 100e6, 0, deadline);
        vm.prank(PROXY);
        executor.execute(REACTIVE, id);
        (, , , , , , , , , bool armed) = executor.orders(id);
        assertTrue(armed); // still armed, emitted OrderSkipped
    }

    function test_executeExpiredSkips() public {
        uint64 deadline = uint64(block.timestamp + 1);
        uint256 id = _createOrder(true, priceLow, 100e6, 0, deadline);
        vm.warp(block.timestamp + 10);
        vm.prank(PROXY);
        executor.execute(REACTIVE, id);
        (, , , , , , , , , bool armed) = executor.orders(id);
        assertTrue(armed);
    }

    function test_executeFillsAndDisarms() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        pool.setPrice(priceHigh, 1);
        router.setMockAmountOut(90e6);
        uint256 id = _createOrder(true, priceHigh, 100e6, 50e6, deadline);
        vm.prank(PROXY);
        executor.execute(REACTIVE, id);
        (, , , , , , , , , bool armed) = executor.orders(id);
        assertFalse(armed);
        assertGt(IERC20(_buyToken()).balanceOf(recipient), 0);
    }

    function test_executeSlippageRevertsAndStaysArmed() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        pool.setPrice(priceHigh, 1);
        router.setMockAmountOut(40e6); // below minOut
        uint256 id = _createOrder(true, priceHigh, 100e6, 50e6, deadline);
        vm.prank(PROXY);
        vm.expectRevert();
        executor.execute(REACTIVE, id);
        (, , , , , , , , , bool armed) = executor.orders(id);
        assertTrue(armed);
    }

    function test_ordersOfAndCount() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        _createOrder(true, priceHigh, 1, 0, deadline);
        _createOrder(true, priceHigh, 1, 0, deadline);
        uint256[] memory ids = executor.ordersOf(owner);
        assertEq(ids.length, 2);
        assertEq(executor.orderCount(), 2);
    }

    function _buyToken() internal view returns (address) {
        return pool.token0() == _sellToken() ? pool.token1() : pool.token0();
    }
}
