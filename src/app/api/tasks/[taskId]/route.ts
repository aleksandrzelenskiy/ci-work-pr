// app/api/task/[taskid]/route.ts

import { NextResponse } from 'next/server';
import dbConnect from '@/utils/mongoose';
import TaskModel from '@/app/models/TaskModel';
import UserModel from '@/app/models/UserModel';
import Report from '@/app/models/ReportModel';
import { currentUser } from '@clerk/nextjs/server';
import type { TaskEvent, PriorityLevel } from '@/app/types/taskTypes';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs/promises';

interface UpdateData {
  status?: string;
  taskName?: string;
  bsNumber?: string;
  taskDescription?: string;
  initiatorId?: string;
  executorId?: string;
  dueDate?: string;
  priority?: PriorityLevel;
  event?: {
    details?: {
      comment?: string;
    };
  };
  existingAttachments?: string[];
}

// Подключение к базе данных
async function connectToDatabase() {
  try {
    await dbConnect();
    console.log('Connected to MongoDB');
  } catch (error) {
    console.error('Failed to connect to MongoDB:', error);
    throw new Error('Failed to connect to database');
  }
}

// GET-запрос для получения задачи по ID
export async function GET(
  request: Request,
  { params }: { params: { taskid: string } }
) {
  try {
    await connectToDatabase();
    const { taskid } = params;
    const taskIdUpperCase = taskid.toUpperCase();

    const task = await TaskModel.findOne({ taskId: taskIdUpperCase });
    if (!task)
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });

    const photoReports = await Report.find({
      reportId: { $regex: `^${taskIdUpperCase}` },
    });

    return NextResponse.json({
      task: { ...task.toObject(), photoReports: photoReports || [] },
    });
  } catch (error) {
    console.error('Error:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

// PATCH-запрос для обновления задачи
export async function PATCH(
  request: Request,
  { params }: { params: { taskid: string } }
) {
  try {
    await connectToDatabase();
    const { taskid } = params;
    const taskId = taskid.toUpperCase();

    // Проверка аутентификации
    const user = await currentUser();
    if (!user) {
      return NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      );
    }

    // Поиск задачи
    const task = await TaskModel.findOne({ taskId });
    if (!task) {
      return NextResponse.json({ error: 'Task not found' }, { status: 404 });
    }

    // Определяем тип запроса (JSON или FormData)
    const contentType = request.headers.get('content-type');
    let updateData: UpdateData = {};
    const attachments: File[] = [];

    if (contentType?.includes('application/json')) {
      // Обработка JSON-запроса
      updateData = await request.json();
    } else if (contentType?.includes('multipart/form-data')) {
      // Обработка FormData
      const formData = await request.formData();
      const entries = Array.from(formData.entries());

      // Разделяем вложения и остальные данные
      const otherData: Record<string, FormDataEntryValue> = {};
      for (const [key, value] of entries) {
        if (key.startsWith('attachments_') && value instanceof File) {
          attachments.push(value);
        } else {
          otherData[key] = value;
        }
      }

      // Преобразуем в объект UpdateData
      updateData = Object.fromEntries(
        Object.entries(otherData).map(([key, value]) => [key, value.toString()])
      ) as unknown as UpdateData;

      // Парсим existingAttachments если есть
      if (otherData.existingAttachments) {
        updateData.existingAttachments = JSON.parse(
          otherData.existingAttachments.toString()
        );
      }
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    // Обновление статуса
    if (updateData.status) {
      const oldStatus = task.status;
      task.status = updateData.status;

      const statusEvent: TaskEvent = {
        action: 'STATUS_CHANGED',
        author: `${user.firstName} ${user.lastName}`.trim() || 'Unknown',
        authorId: user.id,
        date: new Date(),
        details: {
          oldStatus,
          newStatus: task.status,
          comment: updateData.event?.details?.comment,
        },
      };

      task.events = task.events || [];
      task.events.push(statusEvent);
    }

    // Обновление полей задачи
    if (updateData.taskName) task.taskName = updateData.taskName;
    if (updateData.bsNumber) task.bsNumber = updateData.bsNumber;
    if (updateData.taskDescription)
      task.taskDescription = updateData.taskDescription;
    if (updateData.initiatorId) {
      task.initiatorId = updateData.initiatorId;
      const initiator = await UserModel.findOne({
        clerkUserId: updateData.initiatorId,
      });
      if (initiator) {
        task.initiatorName = initiator.name;
        task.initiatorEmail = initiator.email;
      }
    }
    if (updateData.executorId) {
      task.executorId = updateData.executorId;
      const executor = await UserModel.findOne({
        clerkUserId: updateData.executorId,
      });
      if (executor) {
        task.executorName = executor.name;
        task.executorEmail = executor.email;
      }
    }
    if (updateData.dueDate) {
      const dueDate = new Date(updateData.dueDate);
      if (!isNaN(dueDate.getTime())) task.dueDate = dueDate;
    }
    if (updateData.priority) {
      task.priority = updateData.priority as PriorityLevel;
    }

    // Обработка вложений
    if (contentType?.includes('multipart/form-data')) {
      const existingAttachments = updateData.existingAttachments || [];
      task.attachments = task.attachments.filter((attachment: string) =>
        existingAttachments.includes(attachment)
      );

      const uploadDir = join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadDir, { recursive: true });

      const newAttachments: string[] = [];
      for (const file of attachments) {
        const buffer = Buffer.from(await file.arrayBuffer());
        const filename = `${uuidv4()}-${file.name}`;
        const filePath = join(uploadDir, filename);
        await writeFile(filePath, buffer);
        newAttachments.push(`/uploads/${filename}`);
      }
      task.attachments.push(...newAttachments);
    }

    // Сохранение задачи
    const updatedTask = await task.save();

    return NextResponse.json({ task: updatedTask });
  } catch (error) {
    console.error('Error updating task:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
