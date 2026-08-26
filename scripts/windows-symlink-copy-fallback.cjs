const fs = require("node:fs");
const path = require("node:path");

function copyInsteadOfSymlink(target, dest) {
  const resolvedTarget = path.isAbsolute(target) ? target : path.resolve(path.dirname(dest), target);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(resolvedTarget, dest, { force: true, recursive: true });
}

const originalSymlinkSync = fs.symlinkSync.bind(fs);

fs.symlinkSync = function symlinkSyncWithCopyFallback(target, dest, type) {
  try {
    return originalSymlinkSync(target, dest, type);
  } catch (error) {
    if (error?.code === "EEXIST") {
      return;
    }
    if (error?.code === "EPERM" || error?.code === "ENOTSUP") {
      copyInsteadOfSymlink(String(target), String(dest));
      return;
    }
    throw error;
  }
};
