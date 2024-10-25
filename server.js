/*Copyright (C) 2024 Crawford Currie http://c-dot.co.uk*/
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);
import Path from "path";
const __dirname = Path.dirname(__filename);
import getopt from "posix-getopt";
import Cors from "cors";
import Express from "express";
import HTTP from "http";

// Option defaults
const options = {
  port: 9094
};

const DESCRIPTION = [
  "USAGE",
  `\tnode ${Path.relative(".", process.argv[1])} [options]`,
  "DESCRIPTION",
  "\tLay planks on a floor",
  "OPTIONS",
  `\t-p, --port <file> - Port to start server on (default ${options.port})`
].join("\n");

const go_parser = new getopt.BasicParser(
  "p:(port)",
  process.argv);

function fail(message) {
  if (message)
    console.error(message);
  console.log(DESCRIPTION);
  process.exit();
}

let option;
while ((option = go_parser.getopt())) {
  switch (option.option) {
  default: fail(`Unknown option -${option.option}\n${DESCRIPTION}`);
  }
}
if (process.argv.length > go_parser.optind())
  fail(`Unexpected "${process.argv[go_parser.optind()]}"`);

console.debug(
  `Starting server on port ${options.port}`);

const express = new Express();
express.use(Cors());
express.use(Express.static(__dirname));
const cmdRouter = Express.Router();

cmdRouter.get(
  "/",
  (req, res) => res.sendFile(
    Path.join(__dirname, "fill.html"),
    err => {
      if (err)
        console.error(err, "\n*** Failed to load fill.html ***");
    }
  ));
express.use(cmdRouter);

const protocol = HTTP.Server(express);
protocol.listen(options.port);
