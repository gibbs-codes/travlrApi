import winston from 'winston';
import env from '../config/env.js';

const { combine, timestamp, printf, colorize, splat } = winston.format;

const formatMessage = printf(({ level, message, timestamp, ...meta }) => {
  const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
  return `${timestamp} ${level}: ${message}${metaString}`;
});

const logger = winston.createLogger({
  level: env.logLevel,
  format: combine(
    splat(),
    timestamp(),
    formatMessage
  ),
  transports: [
    new winston.transports.Console({
      format: combine(
        colorize(),
        splat(),
        timestamp(),
        formatMessage
      )
    })
  ]
});

export default logger;
