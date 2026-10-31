
import { schemaFrom } from "@red-cup-engineering/json-schema-services-section/contracts";
import {
  admissionFailureContract,
  packageManifestAdmissionContract,

} from "@red-cup-engineering/jsnode-package-services-section/workspace/schemas/admission";

const nonemptyStringSchema = { type: "string", minLength: 1 };

export const workspacePackageRootScanSchema = {
  $id: "metroplat/projections/boundaries/workspace-scanner/package-root",
  title: "WorkspacePackageRootScan",
  description: "Finite package-root host mark admitted through the workspace-scanner boundary.",
  type: "object",
  required: ["kind", "root", "source", "admission"],
  properties: {
    kind: { const: "metroplat.workspace.package-root" },
    root: nonemptyStringSchema,
    source: nonemptyStringSchema,
    admission: {
      anyOf: [
        { $ref: "metroplat/admission/package-manifest" },
        { $ref: "metroplat/admission/failure" },
      ],
    },
  },
  additionalProperties: false,
};

export const workspaceScanSchema = {
  $id: "metroplat/projections/boundaries/workspace-scanner/scan",
  title: "WorkspaceScan",
  description: "Finite scan of package-root host marks under one workspace root.",
  type: "object",
  required: ["kind", "root", "packages"],
  properties: {
    kind: { const: "metroplat.workspace.scan" },
    root: nonemptyStringSchema,
    packages: { type: "array", items: workspacePackageRootScanSchema },
  },
  additionalProperties: false,
};

export const workspacePackageRootScanContract = schemaFrom(workspacePackageRootScanSchema, [
  packageManifestAdmissionContract,
  admissionFailureContract,
]);

export const workspaceScanContract = schemaFrom(workspaceScanSchema, [workspacePackageRootScanContract]);

