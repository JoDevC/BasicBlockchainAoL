const express = require('express');
const app = express();
const bodyParser = require('body-parser');
const Blockchain = require('./blockchain');
//const uuid = require('uuid/v1'); //this code is not working
const port = process.argv[2];
const rp = require('request-promise');

const { v1: uuidv1 } = require('uuid');
const nodeAddress = uuidv1().split('-').join('');
//const nodeAddress =uuid().split('-').join(''); //this code not working


const bitcoin = new Blockchain();

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({extended:false}));


app.get('/blockchain', function (req, res) {
  res.send(bitcoin);
});


app.post('/transaction', function (req, res) {
  const newTransaction = req.body;
  const blockIndex = bitcoin.addTransactionToPendingTransactions(newTransaction);
  res.json({note: 'Transaction will be added in block ${blockIndex}.'});
});

app.post('/transaction/broadcast', function(req, res){
  const newTransaction = bitcoin.createNewTransaction(req.body.price, req.body.buyer, req.body.seller, req.body.propertyAddress, req.body.propertyCertificate);
  bitcoin.addTransactionToPendingTransactions(newTransaction);

  const requestPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl => {
    const requestOptions = {
      uri: networkNodeUrl + '/transaction',
      method: 'POST',
      body: newTransaction,
      json: true
    };
    requestPromises.push(rp(requestOptions));
  });

    Promise.all(requestPromises)
    .then(data => {
      res.json({note: 'Transaction created and broadcast successfully.'});
    });
});



app.get('/mine',function(req,res){
  const LastBlock = bitcoin.getLastBlock();
  const previousBlockHash = LastBlock['hash'];
  const currentBlockData = {
    transactions: bitcoin.pendingTransactions,
    index: LastBlock['index'] + 1
  }
  const nonce = bitcoin.proofOfWork(previousBlockHash, currentBlockData);
  const blockHash = bitcoin.hashBlock(previousBlockHash, currentBlockData, nonce);
  const newBlock =bitcoin.createNewBlock(nonce, previousBlockHash, blockHash);

  const requestPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl => {
    const requestOptions = {
      uri: networkNodeUrl + '/receive-new-block',
      method: 'POST',
      body: { newBlock: newBlock },
      json: true
    };

    requestPromises.push(rp(requestOptions));
  });

  Promise.all(requestPromises)
  .then(data => {
    const requestOptions = {
      uri: bitcoin.currentNodeUrl + '/transaction/broadcast',
      method: 'POST',
      body: {
        price: 12.5,
        buyer: "00",
        seller: nodeAddress
      },
      json: true
    };
    return rp(requestOptions);
  })
  .then(data => {
    res.json({
      note: "New Block mined Successfully",
      block: newBlock
    });
  })
});


app.post('/receive-new-block', function(req, res){
  const newBlock = req.body.newBlock;
  const lastBlock = bitcoin.getLastBlock();
  const correctHash = lastBlock.hash == newBlock.previousBlockHash;
  const correctIndex = lastBlock['index']+1 == newBlock['index'];

  if ( correctHash && correctIndex ){
    bitcoin.chain.push(newBlock);
    bitcoin.pendingTransactions = [];
    res.json({
      note: "New block received and accepted.",
      newBlock: newBlock
    });
  } else{
    res.json({
      note: 'New block rejected.',
      newBlock: newBlock
    });
  }
});



//register a node and broadcast it the network
app.post('/register-and-broadcast-node',function(req,res){
  const newNodeUrl = req.body.newNodeUrl;
  if(bitcoin.networkNodes.indexOf(newNodeUrl) == -1) bitcoin.networkNodes.push(newNodeUrl);

  const regNodesPromises = [];
  bitcoin.networkNodes.forEach(networkNodeUrl => {
    const requestOptions = {
      uri:networkNodeUrl + '/register-node',
      method: 'POST', 
      body: { newNodeUrl: newNodeUrl },
      json: true 
    };
    regNodesPromises.push(rp(requestOptions));
  });
  Promise.all(regNodesPromises)
  .then(data => {
    const bulkRegisterOptions = {
      uri: newNodeUrl + '/register-nodes-bulk',
      method: 'POST',
      body: { allNetworkNodes: [ ...bitcoin.networkNodes, bitcoin.currentNodeUrl] },
      json: true
    };
    return rp(bulkRegisterOptions);
  })
  .then(data => {
    res.json ({ note: 'New node registered with network successfully.'});
  });
});

//register a node with the network
app.post('/register-node', function(req,res){
  const newNodeUrl = req.body.newNodeUrl;
  const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(newNodeUrl) == -1;
  const notCurrentNode = bitcoin.currentNodeUrl !== newNodeUrl;
  if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(newNodeUrl);
  res.json({ note: 'New node registered successfully with node.'});
});

//register nodes at once
app.post('/register-nodes-bulk', function(req,res){
  const allNetworkNodes = req.body.allNetworkNodes;
  allNetworkNodes.forEach(networkNodeUrl => {
    const nodeNotAlreadyPresent = bitcoin.networkNodes.indexOf(networkNodeUrl) == -1;
    const notCurrentNode =bitcoin.currentNodeUrl !== networkNodeUrl;
    if (nodeNotAlreadyPresent && notCurrentNode) bitcoin.networkNodes.push(networkNodeUrl);
  });
  res.json({ note:'Bulk registration successful.'});
});


app.get('/consensus', function(req, res){
  const requestPromises = [];
  bitcoin.networkNodes.forEach(networkodeurl => {
    const requestOptions = {
      uri: networkodeurl + '/blockchain',  
      method: 'GET',
      json: true
    };
    requestPromises.push(rp(requestOptions));
  });
  Promise.all(requestPromises)
  .then(blockchains => {
    const currentChainLength = bitcoin.chain.length;
    let maxChainLength = currentChainLength;
    let newLongestChain = null;
    let newPendingTransactions = null;

    blockchains.forEach(blockchain => {
      if(blockchain.chain.length > maxChainLength){
        maxChainLength = blockchain.chain.length;
        newLongestChain = blockchain.chain;
        newPendingTransactions = blockchain.pendingTransactions;
      };
    });

    if (!newLongestChain || (newLongestChain && !bitcoin.chainIsValid(newLongestChain))){
      res.json({
        note: 'Current chain has not been replaced.',
        chain: bitcoin.chain
      });
    }
    else if (newLongestChain && bitcoin.chainIsValid(newLongestChain)){
      bitcoin.chain = newLongestChain;
      bitcoin.pendingTransactions = newPendingTransactions;
      res.json({
        note: 'This chain has been replaced.',
        chain: bitcoin.chain
      });
    }

  });
});


app.get('/block/:blockHash', function(req,res){ 
  // localhost:3001/block/blablaThisIsTheHashblablabla
  const blockHash = req.params.blockHash;
  const correctBlock = bitcoin.getBlock(blockHash);
  res.json({
    block: correctBlock 
  })
});


app.get('/transaction/:transactionId', function(req,res){
  const transactionId = req.params.transactionId;
  const transactionData = bitcoin.getTransaction(transactionId);
  res.json({
    transaction: transactionData.transaction, 
    block: transactionData.block 
  })
});

app.get('/address/:address', function(req,res) {
  const address =req.params.address;
  const addressData = bitcoin.getAddressData(address);
  res.json({
    addressData: addressData 
  });
});

app.get('/block-explorer',function(req,res) {
  res.sendFile('/block-explorer/index.html', { root: __dirname});
});


app.listen(port, function(){
    console.log(`Listening on port ${port}...`);
});