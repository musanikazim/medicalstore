import "reflect-metadata";
import "dotenv/config";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import express from "express";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import path from "node:path";
import { api } from "./api";
import { db } from "./engine";
import { scheduleBackups } from "./backup";
@Module({})
class AppModule {}
async function main() {
  await db.$connect();
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: ["'self'"],
        },
      },
    }),
  );
  app.use(express.json({ limit: "2mb" }));
  app.use(cookieParser());
  app.use("/api", api);
  app.use(express.static(path.resolve("dist")));
  app.use((req: any, res: any, next: any) => {
    if (req.method === "GET" && !req.path.startsWith("/api"))
      res.sendFile(path.resolve("dist/index.html"));
    else next();
  });
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3001), "0.0.0.0");
  scheduleBackups();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
