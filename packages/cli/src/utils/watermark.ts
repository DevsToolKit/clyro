// utils/watermark.ts
import chalk from "chalk";
import boxen from "boxen";

export function showWatermark() {
  // 1. ASCII logo
  console.log(
    chalk.cyan(`
           ░██                                      ░██            ░██
           ░██                                     ░██                
 ░███████  ░██ ░██    ░██ ░██░████  ░███████      ░██   ░██    ░██ ░██
░██    ░██ ░██ ░██    ░██ ░███     ░██    ░██    ░██    ░██    ░██ ░██
░██        ░██ ░██    ░██ ░██      ░██    ░██   ░██     ░██    ░██ ░██
░██    ░██ ░██ ░██   ░███ ░██      ░██    ░██  ░██      ░██   ░███ ░██
 ░███████  ░██  ░█████░██ ░██       ░███████  ░██        ░█████░██ ░██
                      ░██                                             
                ░███████                                              
`)
  );

  // 2. Professional details in a single box
  const content = [
    `${chalk.bold("clyro UI")}`,
    chalk.gray("A professional UI component library for modern web apps."),
    "",
    `${chalk.bold("Version:")}  ${chalk.green("v0.1.0-beta")}`,
    `${chalk.bold("Repo:")}     ${chalk.underline.magenta(
      "https://github.com/devsToolKit/clyro"
    )}`,
  ].join("\n");

  const infoBox = boxen(content, {
    padding: 1,
    borderStyle: "round",
    borderColor: "cyan",
  });

  console.log(infoBox);
}
