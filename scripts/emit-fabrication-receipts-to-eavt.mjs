#!/usr/bin/env node
// One effect: fold each complete admitted fabrication receipt into world rows.
import { resolve } from "node:path";
import { execute as executeEavt } from "@red-cup-engineering/eavt-engineering-services-section";
import { foldFabricationRecordIntoWorldRows } from "@red-cup-engineering/jsnode-package-engineering-services-section/fabrication-receipts";
import { walkPosixPaths } from "@red-cup-engineering/computer-filepath-engineering-services-section/walk-posix-paths";
import { readTextFile } from "@red-cup-engineering/computer-file-engineering-services-section/read-text-file";
import { runJavascriptNodeOperation } from "@red-cup-engineering/node-js-function-engineering-services-section/operation";

const RECORD_PATH_PATTERN = /\/data\/records\/fabrication-receipt-records\/\d{4}-\d{2}-\d{2}-.*fabrication-receipt\.json$/u;

/**
 * Walks `root` for dated fabrication-receipt.json files under any data/records/fabrication-receipt-records/ directory and
 * appends world rows only for complete receipts whose fabrication evidence admits. Historical
 * creation-only records remain discoverable on disk but cannot create receiver rows.
 * @param {{root: string, tracePath: string}} args
 * @returns {Promise<object>} A run summary: files read, entities touched, rows appended.
 */
export async function emitFabricationRecordsToEavt({ root, tracePath }) {
  const walk = await walkPosixPaths({
    root,
    excludes: ["node_modules", ".git"],
    symlinks: "skip",
    includeFile: (file) => RECORD_PATH_PATTERN.test(`/${file.path}`),
  });
  // symlinks bypass includeFile in computer-file-engine; re-apply the pattern to be certain.
  const recordPaths = walk.files.map((file) => file.path).filter((path) => RECORD_PATH_PATTERN.test(`/${path}`)).sort();

  let existingRows = [];
  try {
    existingRows = executeEavt({ operation: "read", path: tracePath });
  } catch {
    existingRows = [];
  }
  let filesRead = 0;
  let rowsAppended = 0;
  const touchedPackages = new Set();
  const appendedRows = [];
  const rejectedRecords = [];
  let nextT = Math.max(-1, ...existingRows.map((row) => Number.isInteger(row.t) ? row.t : -1)) + 1;

  for (const relativePath of recordPaths) {
    const absolutePath = resolve(root, relativePath);
    filesRead += 1;
    let folded;
    try {
      const record = JSON.parse((await readTextFile({ path: absolutePath })).text);
      folded = foldFabricationRecordIntoWorldRows({ receipt: record, t: nextT, source: { locator: absolutePath } });
    } catch (error) {
      rejectedRecords.push({ path: relativePath, code: error?.code ?? "RECEIPT_UNREADABLE", message: error?.message ?? String(error) });
      continue;
    }
    const packageName = folded.rows[0]?.v?.name;
    if (typeof packageName === "string") touchedPackages.add(packageName);
    for (const row of folded.rows) {
      executeEavt({ operation: "append", path: tracePath, row });
      appendedRows.push(row);
      rowsAppended += 1;
    }
    nextT = folded.rows.at(-1).t + 1;
  }

  return {
    type: "FabricationReceiptEavtEmissionRunSummary",
    version: 1,
    root,
    trace: tracePath,
    filesRead,
    packagesTouched: touchedPackages.size,
    rowsAppended,
    refusedReceipts: rejectedRecords,
    sampleRows: appendedRows.slice(0, 5),
  };
}

if (import.meta.main) {
  const result = await runJavascriptNodeOperation({ name: "emit-fabrication-receipts-to-eavt", description: "Walks `root` for dated fabrication receipts and appends world rows only after complete receipt admission binds the born package to realization evidence.", operation: emitFabricationRecordsToEavt }, { arguments: process.argv.slice(2), standardInput: process.stdin, standardOutput: process.stdout });
  process.exitCode = result.exitCode;
}
