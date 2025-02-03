import { Router } from 'express';
import { auth } from '../auth/middleware';
import {
  createChannel,
  deleteChannel,
  deleteMessage,
  deleteMessages,
  editMessage,
  forwardMessage,
  getChannelById,
  getChannelMedia,
  getChannelMessages,
  getChannels,
  messageDelivered,
  messageSeen,
  sendMessage,
} from './messages.service';

const router = Router();

router.get('/channels', auth, getChannels);

router.post('/channels/create/:userId', auth, createChannel);

router.delete('/channels/messages/delete', auth, deleteMessages);

router.delete('/channels/:id/delete', auth, deleteChannel);

router.get('/channels/:id', auth, getChannelById);

router.get('/channels/:channelId/messages', auth, getChannelMessages);

router.get('/channels/:channelId/media', auth, getChannelMedia);

router.post('/messages', auth, sendMessage);

router.patch('/messages/:id/edit', auth, editMessage);

router.delete('/messages/:id/:deleted/delete', auth, deleteMessage);

router.post('/messages/:id/:receiverId/forward', auth, forwardMessage);

router.put('/messages/seen/:id', auth, messageSeen);

router.put('/messages/delivered/:id', auth, messageDelivered);

export default router;
