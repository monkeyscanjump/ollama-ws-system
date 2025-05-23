import { MessageType } from '../types';
import { createLogger } from '../../utils';

const logger = createLogger('client:validator');

export function validateMessage(message: any): boolean {
  if (!message || typeof message !== 'object') {
    logger.error('Invalid message: not an object');
    return false;
  }

  if (!message.type || typeof message.type !== 'string') {
    logger.error('Invalid message: missing type');
    return false;
  }

  // Check for required message-specific fields
  switch (message.type) {
    case MessageType.STREAM_TOKEN:
      if (!message.token || !message.id) {
        logger.error('Invalid token message: missing required fields');
        return false;
      }
      break;

    case MessageType.ERROR:
      if (!message.error) {
        logger.error('Invalid error message: missing error description');
        return false;
      }
      break;

    case MessageType.CHALLENGE:
      if (!message.challenge) {
        logger.error('Invalid challenge message: missing challenge string');
        return false;
      }
      break;

    case MessageType.STREAM_START:
      if (!message.id || !message.model) {
        logger.error('Invalid stream start message: missing required fields');
        return false;
      }
      break;

    case MessageType.STREAM_END:
      if (!message.id) {
        logger.error('Invalid stream end message: missing id');
        return false;
      }
      break;
  }

  return true;
}
