import chalk from "chalk";
import boxen from "boxen";

const boxOptions = {
  padding: 1,
  margin: 1,
  borderStyle: "round" as const,
};

function formatLabel(label: string, color = chalk.white) {
  return chalk.dim("•") + " " + color(label);
}

export const logger = {
  info: (msg: string) => {
    console.log(formatLabel(msg, chalk.cyan));
  },

  success: (msg: string) => {
    console.log(formatLabel(msg, chalk.green));
  },

  warn: (msg: string) => {
    console.log(formatLabel(msg, chalk.yellow));
  },

  error: (msg: string) => {
    console.log(formatLabel(msg, chalk.red));
  },

  boxError: (title: string, lines: string[]) => {
    console.log(
      boxen(
        [
          chalk.bold.yellow(title),
          "",
          ...lines.map((l) => chalk.yellow("  • " + l)),
        ].join("\n"),
        {
          ...boxOptions,
          borderColor: "yellow",
        }
      )
    );
  },

  boxInfo: (title: string, lines: string[]) => {
    console.log(
      boxen(
        [
          chalk.bold.blue(title),
          "",
          ...lines.map((l) => chalk.blue("  • " + l)),
        ].join("\n"),
        {
          ...boxOptions,
          borderColor: "blue",
        }
      )
    );
  },

  break: () => {
    console.log("");
  },
};
