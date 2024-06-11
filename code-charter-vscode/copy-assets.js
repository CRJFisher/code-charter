const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const srcDir = path.join(__dirname, './out');
const destDir = path.join(__dirname, './assets');

// Create the destination directory if it doesn't exist
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

function compileTs(inlineConfig) {
    const parsedConfig = ts.parseJsonConfigFileContent(
        inlineConfig,
        ts.sys,
        path.resolve(__dirname)
    );

    const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);

    const emitResult = program.emit();

    const allDiagnostics = ts
        .getPreEmitDiagnostics(program)
        .concat(emitResult.diagnostics);

    allDiagnostics.forEach(diagnostic => {
        if (diagnostic.file) {
            const { line, character } = diagnostic.file.getLineAndCharacterOfPosition(
                diagnostic.start
            );
            const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n');
            console.log(
                `${diagnostic.file.fileName} (${line + 1},${character + 1}): ${message}`
            );
        } else {
            console.log(ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
        }
    });

    const exitCode = emitResult.emitSkipped ? 1 : 0;
    return exitCode;
}

const inlineConfig = {
    compilerOptions: {
        target: "es2020",
        module: "es2020",
        outDir: "./assets",
        rootDir: "./src",
        strict: true,
        esModuleInterop: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true
    },
    include: ["src/diagram/renderGraph.ts"]
};

const exitCode = compileTs(inlineConfig);

const outputDir = path.resolve(__dirname, 'assets');
fs.readdir(outputDir, { withFileTypes: true }, (err, files) => {
  if (err) {
    console.error('Error reading output directory:', err);
    process.exit(1);
  }

  files.forEach(file => {
    if (file.isDirectory()) {
      const subDir = path.join(outputDir, file.name);
      fs.readdir(subDir, (err, subFiles) => {
        if (err) {
          console.error('Error reading subdirectory:', err);
          return;
        }

        subFiles.forEach(subFile => {
          const oldPath = path.join(subDir, subFile);
          const newPath = path.join(outputDir, subFile);
          fs.rename(oldPath, newPath, err => {
            if (err) {
              console.error('Error moving file:', err);
            }
          });
        });

        // Remove the empty subdirectory
        fs.rmdir(subDir, err => {
          if (err) {
            console.error('Error removing subdirectory:', err);
          }
        });
      });
    }
  });

  if (exitCode !== 0) {
    console.error('TypeScript compilation failed');
    process.exit(exitCode);
  } else {
    console.log('TypeScript compilation succeeded');
  }
});