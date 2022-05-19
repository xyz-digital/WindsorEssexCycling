const express = require('express');
const mongodb = require('mongodb');

const run = async () => {
  const client = new mongodb.MongoClient('mongodb://localhost:27017');
  const connection = await client.connect();
  const db = connection.db('windsoressexcycling');
  const Nogo = db.collection('nogos');

  const app = express();
  app.use(express.json());
  app.use(express.static('../frontend/dist'));

  app.get('/api/nogos', async (req, res) => {
    const nogos = await Nogo.find({}).toArray();
    res.json(nogos);
  });

  app.post('/api/nogos', async (req, res) => {
    const newNogos = req.body;
    newNogos.forEach(async (newNogo) => {
      const coordinates = newNogo.coordinates;
      await Nogo.insertOne({
        type: 'LineString',
        coordinates,
      });
    });
    res.sendStatus(200);
  });

  app.post('/api/nogos/delete', async (req, res) => {
    const nogoIds = req.body;
    nogoIds.forEach(async (nogoId) => {
      await Nogo.deleteOne({ _id: new mongodb.ObjectId(nogoId) });
    });
    res.sendStatus(200);
  });

  app.listen(4242, () => {
    console.log('http://localhost:4242');
  });
};

run();
