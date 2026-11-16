// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/Test.sol";
import { ISystemContract } from "@reactive/src/interfaces/ISystemContract.sol";
import { IReactive } from "@reactive/src/interfaces/IReactive.sol";
import { TripwireReactive } from "../src/TripwireReactive.sol";

/// @notice Stand-in for the Reactive system contract: records subscriptions and callback requests.
contract MockSystem {
    struct Sub {
        uint256 chainId;
        address contract_;
        uint256 topic0;
        uint256 topic1;
        uint256 topic2;
        uint256 topic3;
    }

    Sub[] public subscriptions;
    ISystemContract.CallbackConfiguration_V_1_0 public lastCallback;
    bytes[] public callbackPayloads;
    uint256 public callbackCount;

    function subscribe(uint256 chainId_, address contract_, uint256 topic0_, uint256 topic1_, uint256 topic2_, uint256 topic3_)
        external
    {
        subscriptions.push(Sub(chainId_, contract_, topic0_, topic1_, topic2_, topic3_));
    }

    function unsubscribe(uint256, address, uint256, uint256, uint256, uint256) external {}

    function requestCallbackV_1_0(ISystemContract.CallbackConfiguration_V_1_0 memory config_) external {
        lastCallback = config_;
        callbackPayloads.push(config_.payload);
        callbackCount++;
    }

    function subscriptionsCount() external view returns (uint256) {
        return subscriptions.length;
    }

    function payloadAt(uint256 i) external view returns (bytes memory) {
        return callbackPayloads[i];
    }
}

contract TripwireReactiveTest is Test {
    address internal constant SYSTEM_ADDR = 0x8888888888888888888888888888888888888888;
    uint256 internal constant UNICHAIN_SEPOLIA = 1301;
    uint256 internal constant BASE_SEPOLIA = 84532;
    address internal constant POOL_UNI = address(0xA11CE);
    address internal constant POOL_BASE = address(0xB0A);
    address internal constant EXECUTOR_UNI = address(0xE1);
    address internal constant EXECUTOR_BASE = address(0xE2);

    uint256 internal constant SWAP_TOPIC0 = 0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67;
    uint256 internal constant CREATED_TOPIC0 = 0x69abf29ff4b038bda1034084e3a365f6e3d01104101fdd5af80372000b4c5fe1;
    uint256 internal constant CANCELLED_TOPIC0 = 0xa4bb54ffb7bcc3eb7bdd81e41ad340b367a9b3a7416cd7764e68713a274c9da3;

    MockSystem internal systemContract;
    TripwireReactive internal reactive;
    address internal deployer = address(0xD00D);

    function setUp() public {
        systemContract = new MockSystem();
        vm.etch(SYSTEM_ADDR, address(systemContract).code);

        vm.prank(deployer);
        reactive = new TripwireReactive();

        vm.prank(deployer);
        reactive.addPool(UNICHAIN_SEPOLIA, POOL_UNI);
        vm.prank(deployer);
        reactive.addExecutor(UNICHAIN_SEPOLIA, EXECUTOR_UNI);
    }

    function _record(uint256 chainId, address emitter, uint256 topic0, uint256 topic1, bytes memory data)
        internal
        pure
        returns (IReactive.LogRecord memory log)
    {
        log = IReactive.LogRecord({
            chainId: chainId,
            contractAddress: emitter,
            topic0: topic0,
            topic1: topic1,
            topic2: 0,
            topic3: 0,
            data: data,
            blockNumber: 12345,
            opCode: 3,
            blockHash: 0xabc,
            txHash: 0xdef,
            logIndex: 0
        });
    }

    function _createdData(address pool, uint160 trigger, bool fireAbove, uint64 deadline)
        internal
        view
        returns (bytes memory)
    {
        return abi.encode(pool, address(0x111), uint256(1000), uint256(900), trigger, fireAbove, deadline, address(0x222));
    }

    function _swapData(uint160 sqrtP) internal pure returns (bytes memory) {
        return abi.encode(int256(1), int256(-1), sqrtP, uint128(1), int24(0));
    }

    function test_addPoolAndExecutorWireSubscriptions() public {
        vm.startPrank(deployer);
        reactive.addPool(BASE_SEPOLIA, POOL_BASE);
        reactive.addExecutor(BASE_SEPOLIA, EXECUTOR_BASE);
        vm.stopPrank();
        assertEq(reactive.executorOf(BASE_SEPOLIA), EXECUTOR_BASE);
        vm.expectRevert(TripwireReactive.ExecutorAlreadySet.selector);
        vm.prank(deployer);
        reactive.addExecutor(BASE_SEPOLIA, EXECUTOR_BASE);
    }

    function test_addPoolOnlyOwner() public {
        vm.prank(address(0xBEEF));
        vm.expectRevert(TripwireReactive.OnlyOwner.selector);
        reactive.addPool(BASE_SEPOLIA, POOL_BASE);
    }

    function test_orderLifecycleAndFire() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint160 trigger = 1500;

        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 1, _createdData(POOL_UNI, trigger, true, deadline));
        vm.prank(SYSTEM_ADDR);
        reactive.react(created);

        bytes32 key = keccak256(abi.encode(UNICHAIN_SEPOLIA, uint256(1)));
        (uint256 orderId, address pool, uint160 t, bool fireAbove, uint64 dl, bool fired) = reactive.orders(key);
        assertEq(orderId, 1);
        assertEq(pool, POOL_UNI);
        assertEq(t, trigger);
        assertTrue(fireAbove);
        assertEq(dl, deadline);
        assertFalse(fired);

        // Price below trigger: no callback.
        IReactive.LogRecord memory swapLow =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1000));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapLow);
        assertEq(_callbackCount(), 0);

        // Price at/above trigger: callback requested once.
        IReactive.LogRecord memory swapHigh =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1600));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapHigh);
        assertEq(_callbackCount(), 1);

        (, , , , , bool firedAfter) = reactive.orders(key);
        assertTrue(firedAfter);

        // Repeated swaps above the trigger never re-fire.
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapHigh);
        assertEq(_callbackCount(), 1);
    }

    function test_fireBelowTriggers() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint160 trigger = 1500;
        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 7, _createdData(POOL_UNI, trigger, false, deadline));
        vm.prank(SYSTEM_ADDR);
        reactive.react(created);
        IReactive.LogRecord memory swapLow =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1400));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapLow);
        assertEq(_callbackCount(), 1);
    }

    function test_cancelledOrderNeverFires() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        uint160 trigger = 1500;
        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 3, _createdData(POOL_UNI, trigger, true, deadline));
        vm.prank(SYSTEM_ADDR);
        reactive.react(created);

        IReactive.LogRecord memory cancelled =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CANCELLED_TOPIC0, 3, abi.encode(uint256(0)));
        vm.prank(SYSTEM_ADDR);
        reactive.react(cancelled);

        IReactive.LogRecord memory swapHigh =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1600));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapHigh);
        assertEq(_callbackCount(), 0);
    }

    function test_expiredOrderNeverFires() public {
        uint64 deadline = uint64(block.timestamp + 1 minutes);
        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 9, _createdData(POOL_UNI, 1000, true, deadline));
        vm.prank(SYSTEM_ADDR);
        reactive.react(created);
        vm.warp(block.timestamp + 2 minutes);
        IReactive.LogRecord memory swapHigh =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1600));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapHigh);
        assertEq(_callbackCount(), 0);
    }

    function test_duplicateCreateDeliveryIgnored() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 5, _createdData(POOL_UNI, 1000, true, deadline));
        vm.startPrank(SYSTEM_ADDR);
        reactive.react(created);
        reactive.react(created);
        vm.stopPrank();
        bytes32[] memory book = reactive.bookOf(UNICHAIN_SEPOLIA, POOL_UNI);
        assertEq(book.length, 1);
    }

    function test_bookFullReverts() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        vm.startPrank(SYSTEM_ADDR);
        for (uint256 i = 1; i <= 64; i++) {
            IReactive.LogRecord memory created = _record(
                UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, i, _createdData(POOL_UNI, 1, true, deadline)
            );
            reactive.react(created);
        }
        IReactive.LogRecord memory extra =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 65, _createdData(POOL_UNI, 1, true, deadline));
        vm.expectRevert(TripwireReactive.PoolBookFull.selector);
        reactive.react(extra);
        vm.stopPrank();
    }

    function test_callbackPayloadCarriesOrderIdAndExecutor() public {
        uint64 deadline = uint64(block.timestamp + 1 days);
        IReactive.LogRecord memory created =
            _record(UNICHAIN_SEPOLIA, EXECUTOR_UNI, CREATED_TOPIC0, 42, _createdData(POOL_UNI, 1000, true, deadline));
        vm.prank(SYSTEM_ADDR);
        reactive.react(created);
        IReactive.LogRecord memory swapHigh =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1600));
        vm.prank(SYSTEM_ADDR);
        reactive.react(swapHigh);

        (uint256 chainId, address recipient, uint64 gasLimit, bytes memory payload) = _lastCallback();
        assertEq(chainId, UNICHAIN_SEPOLIA);
        assertEq(recipient, EXECUTOR_UNI);
        assertEq(gasLimit, 500000);
        bytes memory expected = abi.encodeWithSignature("execute(address,uint256)", address(0), uint256(42));
        assertEq(payload, expected);
    }

    function test_reactOnlySystem() public {
        IReactive.LogRecord memory swapHigh =
            _record(UNICHAIN_SEPOLIA, POOL_UNI, SWAP_TOPIC0, 0, _swapData(1600));
        vm.expectRevert();
        reactive.react(swapHigh);
    }

    function _system() internal view returns (MockSystem) {
        return MockSystem(SYSTEM_ADDR);
    }

    function _callbackCount() internal view returns (uint256) {
        return _system().callbackCount();
    }

    function _lastCallback()
        internal
        view
        returns (uint256 chainId, address recipient, uint64 gasLimit, bytes memory payload)
    {
        return _system().lastCallback();
    }
}
