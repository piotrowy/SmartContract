const EspeoToken = artifacts.require('./EspeoToken.sol');

const ethBalance = (address) => web3.eth.getBalance(address).toNumber();
const toWei = eth => eth * (10 ** 18);
const oneEth = toWei(1);
const minP = toWei(0.01); //minimal payment in wei
const ethToEsp = (eth) => eth * 500;

const transaction = (address, wei) => ({
    from: address,
    value: wei
});

const fail = (msg) => assert(false, msg);
const assertExpectedError = async(promise) => {
    try {
        await promise;
        fail('expected to fail');
    } catch (error) {
        assert(error.message.indexOf('invalid opcode') >= 0, `Expected throw, but got: ${error.message}`);
    }
}

const timeController = (() => {

    const addSeconds = (seconds) => new Promise((resolve, reject) =>
        web3.currentProvider.sendAsync({
            jsonrpc: "2.0",
            method: "evm_increaseTime",
            params: [seconds],
            id: new Date().getTime()
        }, (error, result) => error ? reject(error) : resolve(result.result)));

    const addDays = (days) => addSeconds(days * 24 * 60 * 60);

    const currentTimestamp = () => web3.eth.getBlock(web3.eth.blockNumber).timestamp;

    return {
        addSeconds,
        addDays,
        currentTimestamp
    };
})();

contract('EspeoToken', accounts => {

    const oneHour = 3600;
    const oneDay = 24 * oneHour;
    const fundsWallet = accounts[4];
    const buyerOneWallet = accounts[2];
    const buyerTwoWallet = accounts[3];
    const newToken = (startDate, duration) => EspeoToken.new(fundsWallet, startDate, duration, toWei(0.5), minP);
    const startDate = () => timeController.currentTimestamp();

    it('should have name EspeoToken and initial raised of 0 and initial supply of 500 ESP assigned to fundsWallet ', async() => {
        const token = await newToken(startDate(), oneHour);

        const name = await token.name();
        assert.equal(name, 'EspeoToken');

        const totalSupply = await token.totalSupply();
        assert.equal(totalSupply, toWei(500), 'Total supply mismatch.');

        const totalRaised = await token.totalRaised();
        assert.equal(totalRaised, 0, 'Total raised mismatch.');

        const fundsWalletBalance = await token.balanceOf(fundsWallet);
        assert.equal(fundsWalletBalance.toNumber(), totalSupply, 'Initial funds wallet balance mismatch');
    });

    it('should fail before start date', async() => {
        //given
        const token = await newToken(startDate() + oneHour, oneHour);

        //should fail before start date 
        await assertExpectedError(token.sendTransaction(transaction(fundsWallet, minP)));

        await timeController.addSeconds(3600)

        //should be open
        await token.sendTransaction(transaction(fundsWallet, minP));
    });

    it('should fail after end date', async() => {
        //given
        const token = await newToken(startDate(), oneHour);

        //should be open
        await token.sendTransaction(transaction(fundsWallet, minP));

        await timeController.addSeconds(2 * oneHour);

        //should fail after end date
        await assertExpectedError(token.sendTransaction(transaction(fundsWallet, minP)));
    });

    it('should last 4 weeks if the goal is not reached and allow token transfers afterwards', async() => {
        const token = await newToken(startDate(), 28 * oneDay);

        await token.sendTransaction(transaction(buyerOneWallet, minP));
        await timeController.addDays(4 * 7);

        // should be closed
        assertExpectedError(token.sendTransaction(transaction(buyerTwoWallet, minP)));

        const totalRaised = await token.totalRaised();
        assert.equal(totalRaised.toNumber(), ethToEsp(minP), 'Total raised amount mismatch')

        // should allow token transfer
        await token.transfer(buyerTwoWallet, 1, { from: buyerOneWallet });
    });

    it('should last less than 4 weeks if the goal is reached and allow token transfers afterwards', async() => {
        const token = await newToken(startDate(), 28 * oneDay);

        await token.sendTransaction(transaction(buyerOneWallet, toWei(0.5)));

        // should be closed
        assertExpectedError(token.sendTransaction(transaction(buyerTwoWallet, minP)));

        const totalRaised = await token.totalRaised();
        assert.equal(totalRaised.toNumber(), ethToEsp(toWei(0.5)), 'Total raised amount mismatch')

        // should allow token transfer
        await token.transfer(buyerTwoWallet, 1, { from: buyerOneWallet });
    });

    // Raised ether is going to be transferred to a specific wallet after each payment,
    it('should transfer raised funds to fundsWallet after each payment', async() => {
        const initialFundsWalletBalance = ethBalance(fundsWallet);
        const expectedBalanceGrowth = (wei) => initialFundsWalletBalance + wei;

        const token = await newToken(startDate(), oneDay);

        await token.sendTransaction(transaction(buyerOneWallet, minP));

        assert.equal(ethBalance(token.address), 0, 'Contract balance mismatch');
        assert.equal(ethBalance(fundsWallet), expectedBalanceGrowth(minP), 'Funds wallet balance mismatch');

        await token.sendTransaction(transaction(buyerTwoWallet, minP));

        assert.equal(ethBalance(token.address), 0, 'Contract balance mismatch');
        assert.equal(ethBalance(fundsWallet), expectedBalanceGrowth(minP * 2), 'Funds wallet balance mismatch');
    });

    // Tokens are going to be available for transfers only after the ICO ends,
    it('should not allow token transfers before ICO', async() => {
        const token = await newToken(startDate() + oneHour, oneDay);

        // should not allow token transfer before ICO
        assertExpectedError(token.transfer(buyerTwoWallet, 1, { from: buyerOneWallet }));
    });

    it('should not allow token transfers during ICO', async() => {
        const token = await newToken(startDate(), oneDay);

        await token.sendTransaction(transaction(buyerOneWallet, minP));

        // should not allow token transfer during ICO
        assertExpectedError(token.transfer(buyerTwoWallet, 1, { from: buyerOneWallet }));
    });

    // The tokens are going to be sold at a flat rate of 1 ETH : 50 ESP, 
    // with added +10% bonus when payment is greater than 0.1 ETH.
    it('should be sold with +10% bonus if payment is greater than 0.1 ETH', async() => {
        const token = await newToken(startDate(), oneHour);

        await token.sendTransaction(transaction(buyerOneWallet, toWei(0.2)));
        const buyerOneBalance = await token.balanceOf(buyerOneWallet);

        assert.equal(buyerOneBalance.toNumber(), ethToEsp(toWei(0.2)) * 110 / 100, 'Buyer one token balance mismatch');
    });

    it('should be sold with no bonus if payment is less than 0.1 ETH', async() => {
        const token = await newToken(startDate(), oneHour);

        await token.sendTransaction(transaction(buyerOneWallet, minP));

        const buyerOneBalance = await token.balanceOf(buyerOneWallet);
        assert.equal(buyerOneBalance.toNumber(), ethToEsp(minP), 'Buyer one token balance mismatch');
    });
});