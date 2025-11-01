import express from "express";
import cookieParser from "cookie-parser";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import fs from "fs";
import path from "path";
import routes from "./routes";
import { notFound } from "./middlewares/notFound.middleware";
import { errorHandler } from "./middlewares/errorHandler.middleware";
import { logger } from "./utils/logger";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: "http://localhost:3000",
    credentials: true,
  })
);
app.use(express.json());
app.use(cookieParser());

if (!fs.existsSync("src/logs")) {
  fs.mkdirSync("src/logs");
}

// Morgan + Winston Integration
const stream = {
  write: (message: string) => logger.http(message.trim()),
};

// Setup morgan to log via Winston (with 'dev' style for local)
app.use(
  morgan("combined", {
    stream,
  })
);

// routes
app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
