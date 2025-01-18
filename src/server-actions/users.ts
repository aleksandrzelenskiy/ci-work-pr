'use server';

import UserModel from '@/models/UserModel';
import dbConnect from '@/utils/mongoose';
import { currentUser } from '@clerk/nextjs/server';

dbConnect();

export const GetCurrentUserFromMongoDB = async () => {
  try {
    const clerkUser = await currentUser();
    const user = await UserModel.findOne({ clerkUserId: clerkUser?.id });
    if (user) {
      return {
        success: true,
        data: JSON.parse(JSON.stringify(user)),
      };
    }

    const newUser = new UserModel({
      name: clerkUser?.firstName + ' ' + clerkUser?.lastName,
      email: clerkUser?.emailAddresses[0]?.emailAddress,
      clerkUserId: clerkUser?.id,
      profilePic: clerkUser?.imageUrl,
      role: 'author',
    });

    await newUser.save();

    return {
      success: true,
      data: JSON.parse(JSON.stringify(newUser)),
    };
  } catch (error: unknown) {
    if (error instanceof Error) {
      return {
        success: false,
        message: error.message,
      };
    }
    return {
      success: false,
      message: 'An unknown error occurred',
    };
  }
};
