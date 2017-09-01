pragma solidity ^0.4.15;

import 'EspeoToken.sol';


contract Factory { 

    function numOfDays(uint256 num) {
        return num * 3600 * 24;
    }

    function createContract(
        address _fundsWallet,
        uint256 _startTimestamp,
        uint256 _minCapEth,
        uint256 _maxCapEth) returns(address created) 
    {
        return new EspeoTokenIco(
            _fundsWallet,
            _startTimestamp,
            numOfDays(7),
            _minCapEth * 1 ether,
            _maxCapEth * 1 ether
        );
    }
}