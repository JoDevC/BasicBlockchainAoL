 const sha256 = require('sha256');
 const currentNodeUrl = process.argv[3]; 
 const { v1: uuidv1 } = require('uuid');
 
 function Blockchain(){
    this.chain = [];
    this.pendingTransactions = [];

    this.currentNodeUrl = currentNodeUrl;
    this.networkNodes =[];
    this.createNewBlock(100,'0','0');
 }

Blockchain.prototype.createNewBlock = function (nonce, previousBlockHash, hash){
    const newBlock = {
        index: this.chain.length +1,
        timestamp: Date.now(),
        transactions: this.pendingTransactions,
        nonce: nonce,
        hash: hash,
        previousBlockHash: previousBlockHash
    };
    this.pendingTransactions = [];
    this.chain.push(newBlock);

    return newBlock;
 }

 Blockchain.prototype.getLastBlock = function(){
   return this.chain[this.chain.length -1 ];
 }

 Blockchain.prototype.createNewTransaction = function (price, buyer, seller, propertyAddress, propertyCertificate) {
   const newTransaction = {
      price: price, 
      buyer: buyer,
      seller: seller,
      propertyAddress: propertyAddress,
      propertyCertificate: propertyCertificate,
      propertyId: generatePropertyId(),
      transactionId: uuidv1().split('-').join('')
   };

   if (!price || !buyer || !seller || !propertyAddress || !propertyCertificate) {
      return {
         price: price, 
         buyer: buyer,
         seller: seller,
         propertyAddress: propertyAddress,
         propertyCertificate: propertyCertificate,
      };
   } else {
      return newTransaction;
   };
}

function generatePropertyId() {
   const propId = uuidv1().replace(/-/g, '').substring(0, 10);

   const changeToNumber = BigInt ('0x' + propId);

   const propertyId = changeToNumber.toString();

   if (propertyId.length < 10) {
      return propertyId.padStart(4, '0');
   } else if (propertyId.length > 10) {
      return propertyId.substring(0, 10);
   }
   return propertyId;
}

Blockchain.prototype.addTransactionToPendingTransactions = function(transactionObj){
   this.pendingTransactions.push(transactionObj);
   return this.getLastBlock()['index'] + 1;
}

Blockchain.prototype.hashBlock = function(previousBlockHash, currentBlockData, nonce){
   const dataAsString = previousBlockHash + nonce.toString() + JSON.stringify(currentBlockData);
   const hash = sha256(dataAsString);

   return hash;

}

Blockchain.prototype.proofOfWork = function(previousBlockHash, currentBlockData ){
   let nonce =0;
   let hash = this.hashBlock(previousBlockHash,currentBlockData, nonce);
   while (hash.substring(0,4)!== '0000'){
      nonce++;
      hash = this.hashBlock(previousBlockHash,currentBlockData,nonce);
   }
   return nonce;
}

Blockchain.prototype.chainIsValid = function(blockchain){
   let validChain = true;

   for (var i = 1; i<blockchain.length; i++){
      const currentBlock = blockchain[i];
      const prevBlock = blockchain[i - 1];
      const blockHash = this.hashBlock(prevBlock['hash'], { transactions: currentBlock['transactions'], index: currentBlock['index']}, currentBlock['nonce'] );
      if(blockHash.substring(0,4) !== '0000') validChain = false;
      if(currentBlock['previousBlockHash'] !== prevBlock['hash']) validChain = false;

      //active this code below in last testing of chainIsValid
      //console.log('previousBlockHash =>',prevBlock['hash']);
      //console.log('currentBlockHash =>',currentBlock['hash']);
   };

   const genesisBlock = blockchain[0];
   const correctNonce = genesisBlock['nonce'] === 100;
   const correctPreviousBlockHash = genesisBlock['previousBlockHash'] === '0';
   const correctHash = genesisBlock['hash'] ==='0';
   const correctTransactions = genesisBlock['transactions'].length === 0;

   if(!correctNonce || !correctPreviousBlockHash || !correctHash || !correctTransactions) validChain =false;

   return validChain;
};

Blockchain.prototype.getBlock = function (blockHash){
   let correctBlock =null;
   this.chain.forEach(block => {
      if(block.hash ==blockHash) correctBlock = block;
   });
   return correctBlock;
   
};

Blockchain.prototype.getTransaction = function(transactionId){
   let correctTransaction = null;
   let correctBlock = null;
   
   this.chain.forEach(block =>{
      block.transactions.forEach(transaction => {
         if(transaction.transactionId === transactionId) {
            correctTransaction = transaction;
            correctBlock = block;
         };
      });
   });
   return {
      transaction: correctTransaction,
      block: correctBlock
   }
};

Blockchain.prototype.getAddressData = function (address){
   const addressTransactions = [];
   this.chain.forEach(block => {
      block.transactions.forEach(transaction =>{
         if(transaction.buyer === address || transaction.seller === address){
            addressTransactions.push(transaction);

         };
      });
   });

   let balance = 0;
   addressTransactions.forEach(transaction =>{
      if(transaction.seller === address) balance += transaction.amount;
      else if (transaction.buyer === address) balance -= transaction.amount;
   });
   
   return{
      addressTransactions: addressTransactions,
      addressBalance: balance
   }
};

 module.exports = Blockchain;