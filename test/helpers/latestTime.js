// Returns the time of the last mined block in seconds
function latestTime() {
  var block = web3.eth.blockNumber;

  return web3.eth.getBlock(block).timestamp;
}

module.exports = {
  latestTime,
};
