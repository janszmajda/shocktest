import { MongoClient } from "mongodb";

const globalWithMongo = global as typeof globalThis & {
  _mongoClientPromise?: Promise<MongoClient>;
};

let clientPromise: Promise<MongoClient>;

if (!process.env.MONGODB_URI) {
  // Allow build to succeed without MONGODB_URI; routes will fail at runtime
  clientPromise = Promise.reject(
    new Error("Please add MONGODB_URI to .env.local"),
  );
  // Prevent unhandled rejection during build
  clientPromise.catch(() => {});
} else if (process.env.NODE_ENV === "development") {
  if (!globalWithMongo._mongoClientPromise) {
    globalWithMongo._mongoClientPromise = new MongoClient(
      process.env.MONGODB_URI,
    ).connect();
  }
  clientPromise = globalWithMongo._mongoClientPromise;
} else {
  clientPromise = new MongoClient(process.env.MONGODB_URI).connect();
}

export default clientPromise;
