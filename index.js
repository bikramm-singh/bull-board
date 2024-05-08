const { createBullBoard } = require('@bull-board/api');
const { BullMQAdapter } = require('@bull-board/api/bullMQAdapter');
const { ExpressAdapter } = require('@bull-board/express');
const { Queue: QueueMQ, Worker } = require('bullmq');
const express = require('express');
const sleep = (t) => new Promise((resolve) => setTimeout(resolve, t * 1000));
require('dotenv').config(); // Load environment variables from .env file
const Redis = require("ioredis");

const port = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL; // Use environment variable for Redis URL

console.log("Redis URL:", redisUrl);

const run = async () => {
  try {
    const parsedUrl = new URL(redisUrl);
    console.log("Parsed URL Object:", parsedUrl);

    const redisHost = parsedUrl.hostname;
    const redisPort = parsedUrl.port;
    const redisPassword = parsedUrl.password;

    console.log("Redis Host:", redisHost);
    console.log("Redis Port:", redisPort);
    console.log("Redis Password:", redisPassword);

    const tlsEnabled = parsedUrl.protocol === 'rediss:'; // Check if TLS is enabled

    // Create Redis client
    // const redisClient = new Redis({
    //   port: redisPort,
    //   host: redisHost,
    //   password: redisPassword,
    //   tls: tlsEnabled ? { servername: redisHost } : undefined // Include TLS options if enabled
    // });
    const redisClient = new Redis(redisUrl);

    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });

    redisClient.on('error', (err) => {
      console.error('Redis error:', err);
    });

    const exampleBullMq = new QueueMQ('BullMQ', { connection:  redisClient });

    const app = express();

    const serverAdapter = new ExpressAdapter();
    serverAdapter.setBasePath('/ui');

    createBullBoard({
      queues: [new BullMQAdapter(exampleBullMq)],
      serverAdapter,
    });

    app.use('/ui', serverAdapter.getRouter());

    app.use('/add', (req, res) => {
      const opts = req.query.opts || {};

      if (opts.delay) {
        opts.delay = +opts.delay * 1000; // delay must be a number
      }

      exampleBullMq.add('Add', { title: req.query.title }, opts);
      console.log(req.query.title);
      res.json({ ok: true });
    });

    // Endpoint to add a job
    app.post('/addJob', async (req, res) => {
      const jobData = req.body;
      await exampleBullMq.add('jobName', jobData);
      console.log(req);
      res.send('Job added to queue');
    });

    app.get('/jobs', async (req, res) => {
      try {
        const jobs = await exampleBullMq.getJobs();
        console.log(jobs, "jobs");
        res.json(jobs);
      } catch (error) {
        console.error('Error getting jobs:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    const server = app.listen(port, () => {
      console.log('Server is running on port', port);
      console.log('For the UI, open http://localhost:3000/ui');
      console.log('Make sure Redis is running on port 6379 by default');
      console.log('To populate the queue, run:');
      console.log('  curl http://localhost:3000/add?title=Example');
      console.log('To populate the queue with custom options (opts), run:');
      console.log('  curl http://localhost:3000/add?title=Test&opts[delay]=9');
    });

    // Graceful shutdown
    process.on('SIGINT', () => {
      console.log('Server shutting down...');
      server.close(() => {
        console.log('Server shut down successfully');
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Error:', error);
    process.exit(1); // Exit with non-zero code to indicate failure
  }
};

run().catch((e) => console.error(e));
