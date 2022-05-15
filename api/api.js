const express = require("express");
const mongodb =  require("mongodb");

const run = async () => {
  const client = new mongodb.MongoClient('mongodb://localhost:27017');
  const connection = await client.connect();
  const db = connection.db('windsoressexcycling');
  const Nogo = db.collection('nogos')
  
  const app = express();

  app.get('/api/nogos', async (req, res) => {
    const nogos = await Nogo.find({}).toArray();
    res.json(nogos);
  });

  app.listen(4242, () => {
    console.log("http://localhost:4242");
  })
}

run();
