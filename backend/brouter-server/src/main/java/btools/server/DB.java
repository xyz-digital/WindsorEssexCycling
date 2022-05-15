package btools.server;

import com.mongodb.client.MongoDatabase;
import com.mongodb.client.MongoCollection;
import com.mongodb.client.MongoClient;
import com.mongodb.client.MongoClients;

public class DB {
  public static MongoClient Client;
  public static MongoDatabase database;
  public static MongoCollection Nogo;

  public static void init() {
    Client = MongoClients.create("mongodb://localhost:27017");
    database = Client.getDatabase("windsoressexcycling");
    Nogo = database.getCollection("nogos");
  }
}