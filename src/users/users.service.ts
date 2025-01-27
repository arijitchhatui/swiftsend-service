import { Request, Response } from 'express';
import { ObjectId } from 'mongodb';
import { shake } from 'radash';
import { onlineUsers } from '..';
import { FollowersEntity } from '../entities/followers.entity';
import { UserProfilesEntity } from '../entities/user-profiles.entity';
import { db } from '../rdb/mongodb';
import { Collections } from '../util/constants';
import { UpdateUserInput } from './dto/update-user.dto';

const userProfiles = db.collection<UserProfilesEntity>(Collections.USER_PROFILES);
const followers = db.collection<FollowersEntity>(Collections.FOLLOWERS);

export const updatePostCount = async (userId: ObjectId, count: 1 | -1) => {
  await userProfiles.updateOne({ userId }, { $inc: { postCount: count } });
};

export const updateFollowerCount = async (userId: ObjectId, count: 1 | -1) => {
  await userProfiles.updateOne({ userId }, { $inc: { followerCount: count } });
};

export const updateFollowingCount = async (userId: ObjectId, count: 1 | -1) => {
  await userProfiles.updateOne({ userId }, { $inc: { followingCount: count } });
};

export const getUserProfileByUsernameOrId = async (req: Request, res: Response) => {
  const where = ObjectId.isValid(req.params.usernameOrId)
    ? { _id: new ObjectId(req.params.usernameOrId) }
    : { username: req.params.usernameOrId };

  const userProfile = await userProfiles.findOne(where);
  if (!userProfile) return res.status(404).json({ message: 'User not found' });

  const loggedInUserId = new ObjectId(req.user!.userId);

  const [isFollowedByMe, isFollowing] = await Promise.all([
    followers.findOne({
      followingUserId: loggedInUserId,
      followedUserId: userProfile.userId,
    }),
    followers.findOne({
      followingUserId: loggedInUserId,
      followedUserId: userProfile.userId,
    }),
  ]);

  return res.json({
    ...userProfile,
    isFollowedByMe: !!isFollowedByMe,
    isFollowing: !!isFollowing,
    isOnline: onlineUsers.has(userProfile.userId.toString()),
    lastSeen: new Date(),
  });
};

export const getUserProfiles = async (req: Request, res: Response) => {
  const text = req.query.q as string;
  if (!text) {
    return res.status(400).json({ error: "Parameter can't be empty" });
  }
  const result = await userProfiles
    .aggregate([
      {
        $search: {
          index: 'profiles',
          compound: {
            should: [
              {
                text: {
                  query: text,
                  path: 'username',
                },
              },
              {
                text: {
                  query: text,
                  path: 'fullName',
                },
              },
            ],
          },
        },
      },
    ])
    .toArray();
  const augmentedResult = result.map((user) => {
    const isOnline = onlineUsers.has(user.userId.toString());
    const lastSeen = new Date();
    return { ...user, isOnline, lastSeen };
  });
  return res.json(augmentedResult);
};

export const updateUserProfile = async (req: Request, res: Response) => {
  const body = req.body as UpdateUserInput;
  const userId = new ObjectId(req.user!.userId);

  const username = body.username
    ?.toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^a-z0-9]/g, '');

  const exists = await userProfiles.findOne({ username, userId: { $ne: userId } });
  try {
    if (exists) {
      return res.status(409).json({ message: 'Username already exists!' });
    }

    const userProfile = await userProfiles.findOneAndUpdate(
      { userId },
      {
        $set: shake({
          username,
          bio: body.bio,
          websiteURL: body.websiteURL,
          bannerURL: body.bannerURL,
          pronouns: body.pronouns,
          avatarURL: body.avatarURL,
          updatedAt: new Date(),
        }),
      },
      { returnDocument: 'after' },
    );

    const result = {
      ...userProfile,
    };
    return res.json(result);
  } catch (error) {
    console.error('Error in updating profile :', error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

export const getFollowing = async (req: Request, res: Response) => {
  const followingUserId = new ObjectId(req.params.userId);
  const following = await followers
    .aggregate([
      {
        $match: {
          followingUserId,
        },
      },
      {
        $lookup: {
          from: Collections.USER_PROFILES,
          localField: 'followedUserId',
          foreignField: 'userId',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
    ])
    .toArray();
  const data = await Promise.all(
    following.map(async (user) => {
      const loggedInUserId = new ObjectId(req.user!.userId);
      const isFollowing = await followers.findOne({
        followingUserId: user.user.userId,
        followedUserId: loggedInUserId,
      });
      return {
        ...user,
        user: {
          ...user.user,
          isFollowing: !!isFollowing,
          isFollowedByMe: true,
          isOnline: onlineUsers.has(user.user.userId.toString()),
        },
      };
    }),
  );

  return res.json(data);
};

export const getFollowers = async (req: Request, res: Response) => {
  const followedUserId = new ObjectId(req.params.userId);
  const follower = await followers
    .aggregate([
      {
        $match: {
          followedUserId,
        },
      },
      {
        $lookup: {
          from: Collections.USER_PROFILES,
          localField: 'followingUserId',
          foreignField: 'userId',
          as: 'user',
        },
      },
      {
        $unwind: {
          path: '$user',
          preserveNullAndEmptyArrays: true,
        },
      },
    ])
    .toArray();
  const data = await Promise.all(
    follower.map(async (user) => {
      const loggedInUserId = new ObjectId(req.user!.userId);
      const isFollowedByMe = await followers.findOne({
        followingUserId: loggedInUserId,
        followedUserId: user.user.userId,
      });
      return {
        ...user,
        user: {
          ...user.user,
          isFollowing: true,
          isFollowedByMe: !!isFollowedByMe,
          isOnline: onlineUsers.has(user.user.userId.toString()),
        },
      };
    }),
  );

  return res.json(data);
};

export const followProfile = async (req: Request, res: Response) => {
  const followingUserId = new ObjectId(req.user!.userId);
  const followedUserId = new ObjectId(req.params.userId);
  if (followingUserId.toString() === followedUserId.toString()) {
    return res.status(400).json({ message: "You can't follow  yourself!" });
  }

  const isFollowed = await followers.findOne({ followingUserId, followedUserId });
  if (isFollowed) return res.json({ message: 'ok' });

  await followers.insertOne({
    followingUserId,
    followedUserId,
    createdAt: new Date(),
    deletedAt: null,
  });

  await updateFollowerCount(followedUserId, 1);
  await updateFollowingCount(followingUserId, 1);

  return res.json({ message: 'Followed successfully' });
};

export const unFollowProfile = async (req: Request, res: Response) => {
  const followingUserId = new ObjectId(req.user!.userId);
  const followedUserId = new ObjectId(req.params.userId);

  const { deletedCount } = await followers.deleteOne({
    followingUserId,
    followedUserId,
  });
  const isFollowed = await followers.findOne({ followingUserId, followedUserId });
  if (isFollowed) return res.status(200).json({ message: 'User is followed' });
  if (!deletedCount) return res.status(400).json({ message: 'Nothing to unFollow!' });

  await updateFollowerCount(followedUserId, -1);
  await updateFollowingCount(followingUserId, -1);

  return res.json({ message: 'ok' });
};
