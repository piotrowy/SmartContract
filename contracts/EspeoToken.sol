pragma solidity ^0.4.15;

import 'zeppelin-solidity/contracts/token/ERC20Basic.sol';
import 'zeppelin-solidity/contracts/token/StandardToken.sol';


contract EspeoToken is StandardToken {

    string public name = "EspeoToken";
    string public symbol = "ESP";
    uint256 public decimals = 18;
    uint256 public totalSupply = 500 * (10 ** decimals);
    uint256 public totalRaised; // total ether raised (in wei)

    uint256 public startDate;
    uint256 public durationSeconds;
    uint256 public maxCap; //the ico goal in wei
    uint256 public minPayment; //the ico minimal payment in wei

    mapping (address => uint256) tokenBalances;

    /**
     * Address which will receive raised funds 
     * and owns the total supply of tokens
     */
    address public fundsWallet;

    function EspeoToken(
        address _fundsWallet,
        uint256 _startDate, 
        uint256 _durationSeconds, 
        uint256 _maxCap, 
        uint256 _minPayment) {
        require(_durationSeconds > 0);
        require(_maxCap <= totalSupply);
        require(minPayment % 1 == 0 && minPayment <= maxCap);
        startDate = _startDate;
        durationSeconds = _durationSeconds;
        maxCap = _maxCap * 500;
        minPayment = _minPayment;
        fundsWallet = _fundsWallet;
        totalRaised = 0;

        // initially assign all tokens to the fundsWallet
        balances[fundsWallet] = totalSupply;
        Transfer(0x0, fundsWallet, totalSupply);
    }

    function () payable isIcoOpen {
        require(maxCap >= totalRaised + ethToEsp(msg.value));
        require(msg.value / (10 ** 16) >= 1);
        totalRaised = totalRaised.add(ethToEsp(msg.value));

        uint256 tokenAmount = calculateTokenAmount(msg.value);
        balances[fundsWallet] = balances[fundsWallet].sub(tokenAmount);
        balances[msg.sender] = balances[msg.sender].add(tokenAmount);
        Transfer(fundsWallet, msg.sender, tokenAmount);

        // immediately transfer ether to fundsWallet
        fundsWallet.transfer(msg.value);
    }

    function calculateTokenAmount(uint256 weiAmount) returns(uint256) {
        require(weiAmount / (10 ** 16) >= 1);
        // standard rate: 1 ETH : 500 ESP
        uint256 tokenAmount = ethToEsp(weiAmount);
        if (weiAmount / (10 ** 17) > 1) {
            // +10% bonus for every payment bigger than 0.1 ETH
            return tokenAmount.mul(110).div(100);
        } else {
            return tokenAmount;
        }
    }

    function transfer(address _to, uint _value) isIcoFinished returns (bool) {
        return super.transfer(_to, _value);
    }

    function transferFrom(address _from, address _to, uint _value) isIcoFinished returns (bool) {
        return super.transferFrom(_from, _to, _value);
    }

    function ethToEsp(uint256 eth) returns (uint256) {
        return eth.mul(500);
    }

    modifier isIcoOpen() {
        require(startDate <= now && now <= startDate + durationSeconds && totalRaised < maxCap);
        _;
    }

    modifier isIcoFinished() {
        require(now >= startDate);
        require(totalRaised >= maxCap || (now >= (startDate + durationSeconds)));
        _;
    }
}