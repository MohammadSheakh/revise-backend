const { Profiler } = require("react");

type CursorPagination = {
  limit: number;
  cursor?: string;
  direction?: 'forward' | 'backward';
};

async function getTasksCursor({
  limit,
  cursor,
  direction = 'forward',
}: CursorPagination) {
  const isForward = direction === 'forward';

  const tasks = await prisma.task.findMany({
    take: isForward ? limit + 1 : -(limit + 1),
    skip: cursor ? 1 : 0,
    cursor: cursor ? { id: cursor } : undefined,

    where: {
      deletedAt: null,
    },

    include: {
      createdBy: {
        select: {
          id: true,
          email: true,
        },
      },
      _count: {
        select: {
          subtasks: true,
        },
      },
    },

    // ✅ FIX: deterministic sorting
    orderBy: [
      { createdAt: 'desc' },
      { id: 'desc' },
    ],
  });

  let hasNextPage = false;
  let hasPreviousPage = false;

  // ✅ detect extra record
  if (tasks.length > limit) {
    if (isForward) {
      hasNextPage = true;
      tasks.pop(); // remove extra
    } else {
      hasPreviousPage = true;
      tasks.shift(); // remove extra (because reversed)
    }
  }

  // ✅ normalize order (always same for frontend)
  if (!isForward) {
    tasks.reverse();
  }

  const startCursor = tasks.length > 0 ? tasks[0].id : undefined;
  const endCursor = tasks.length > 0 ? tasks[tasks.length - 1].id : undefined;

  // ✅ infer missing direction flags
  if (isForward) {
    hasPreviousPage = !!cursor;
  } else {
    hasNextPage = !!cursor;
  }

  return {
    data: tasks,
    pagination: {
      limit,
      hasNextPage,
      hasPreviousPage,
      startCursor,
      endCursor,
    },
  };
}
}
=============================>

async function getUserWithActiveTasks(userId : string){
    const user = await prisma.user.findUnique({
        where : { id : userId},
        include : {
            // filter related records
            tasks : {
                where : {
                    status: {
                        in : ['pending', 'in-progress']
                    },
                    deletedAt : null
                },
                orderBy : { priority : 'desc' },
                take : 10, // limit result 
            }
        },
        assignedTasks : {
            where : {
                status : 'in-progress',
                deletedAt : null
            },
            include : {
                createdBy : {
                    select : {
                        id: true,
                        email : true 
                    }
                }
            }
        }
    })
}

// =============================>

// many to many with filter 
async function getCollaborativeTaskWithMembers(taskId : string){
    const task = await prisma.task.findUnique({
        where : { id : taskId },
        include : {
            assignedUsers : {
                where : {
                    status: 'active', // filter active users only
                },
                include : {
                    profile : {
                        select : {
                            firstName : true,
                            lastName : true,
                            avatarUrl : true,
                        }
                    },
                    // nested aggregation
                    _count : {
                        select : {
                            tasks : {
                                where : {
                                    status : 'in-progress'
                                }
                            }
                        }
                    } 
                }
            }
        }
    })
}

// ==============================> 
// raw query with complex join ., 

async function getTaskCompletionAnslytics(startDate : Date, endDate : Date){
    const analytics = await prisma.$queryRaw`
        SELECT
            DATE_TRUNC('day', t."completedAt") as date,
            COUNT(*) as completedCount,
            AVG(EXTRACT(EPOCH FROM (t."completedAt" - t."startTime"))) / 3600 as avg_hours,
            u.email as creator_email,
            p."firstName",
            p."lastName"
        FROM taks t

        INNER JOIN users u ON t."createdById" = u.id
        LEFT JOIN "user_profiles" p ON u.id = p."userId"

        WHERE t.status = 'completed'
         AND t."completedAt" >= ${startDate}
         AND t."completedAt" <= ${endDate}
         AND t."deletedAt" IS NULL
        
        GROUP BY 
            DATE_TRUNC('day', t."completedAt"),
            u.email,
            p."firstName",
            p."lastName"
        ORDER BY date DESC, completedCount DESC
    `
}

// ==============================>

// Senior Level Combined query
Select 
  count(*) as total_taks,
  count(*) Filter(where status = 'completed') as completed_tasks,
  count(st.id) as total_subtasks, 

  count(st.id) Filter (
    where st."isCompleted" = true
  ) as completed_subtaks

FROM tasks t
LEFT JOIN subtaks st ON st."taskId" = t.id

WHERE
( t."createdById" = $1 OR t."ownerId"=   $1)
AND t."deletedAt" IS NULL

//-----------------------------

// upload task attachments
interface UploadAttachmentDTO{
  taskId :string,
  fileName,
  fileSize,
  mimeType ,
  url,
  uploadedBy
}

async function uploadTaskAttachment(data){
  return prisma.$transaction(async  (tx) => {
    // 1. very task exists
    const task = await tx.task.findUnique({
      where: { id : data.taskId}
    })

    if(!task) {
      throw new NotFoundExecption("Task not found")
    }

    // create attachment record
    const attachment = await tx.attachment.create({
      data: {
        taskId : data.taskId,
        ...
        ...
      }
    })

    // update task attachment count 
    await tx.task.update({
      where : { id : data.taskId },
      data : {
        attachmentCount : { increment : 1 },
      }
    })

    return attachment;
  })
}

// use case - get task with attachments 

async function getTaskWithAttachments(taskId : string) {
  return prisma.task.findUnique({
    where : { id : taskId },
    include : {
      attachments : {
        where : { deletedAt: null },
        include : {
          uploadedBy : {
            select : {
              id : true,
              email : true,
              profile : {
                select: {
                  firstName : true,
                  lastName : true
                }
              }
            }
          }
        },
        orderBy : { createdAt : 'desc' }
      }
    } 
  })
}

//------ Search and Filtering 

// Use Case : Advance Task Search

interface SearchFilters {
  query ? : string;
  status ? : string[];
  priority ? : String[];
  taskType ? : string[];
  assignedToUserId ?: string;
  createdById ?: string;
  dateFrom ?: Date;
  dateTo ?:Date;
  page ?: number;
  limit ?: number;
}

async function searchTasks(filters : SearchFilters) {
  const {
    query,
    status,
    priority,
    taskType,
    assignedToUserId,
    createdById,
    dateFrom,
    dateTo,
    page = 1,
    limit = 20
  } = filters;

  // build dynamic where clause
  const where : any = {
    deletedAt : null
  }

  // full text search
  if(query){
    where.OR = [
      { title : { contains : query, mode : 'insensitive'} },
      { description :{ contains : query, mode : 'insensitive' }} }
    ]
  }

  // filter arrays
  if(status?.length){
    where.status = { in : status }
  }
  ... 
  ... 
  ... 

  // user filter
  if(assignedToUserId) {
    where.assignedUserIds = { has : assignedToUserId };
  }

  if(createdById) {
    where.createdById = createdById
  }

  if(dateFrom || dateTo) {
    where.startTime = {}
    if(dateFrom) where.startTime.gte = dateFrom;
    if(dateTo) where.startTime.lte = dateTo;
  }

  // execute search
  const [ tasks, total ] = await Promise.all([
    prisma.task.findMany({
      where,
      skip : (page - 1) * limit,
      take : limit,
      include : {
        assignedUsers : {
          select : {
            id : true,
            ... 
            ... 
            profile : {
              select :{
                firstName : true,
                lastName : true,
              }
            }
          }
        }

        createdBy : {
          select : {
            id : true,
            email : true,
          }
        }

        _count : {
          select : {
            subtasks : true,
            attachments : true,
          }
        }

      },

      orderBy : { createdAt : 'desc' },
    })

    prisma.task.count({ where })
  ])


  return { 
    tasks ,
    pagination : {
      page ,
      limit,
      total,
      totalPages : Math.ceil( total / limit )
    },
    filters
  }
}


//----------- Data export and import
//-- Export all user tasks to CSV

import { Parser } from 'json2csv';

async function exportUserTasks(userId  : string){
  const taks = await prisma.task.findMany({
    where : {
      OR : [ { createdById : userId }, { ownerId : userId }],
      deletedAt : null,
    },
    include: {
      assignedUsers : {
        select : {
          email : true,
          profile : {
            select : {
              firstName : true,
              lastName : true,
            }
          }
        }
      }

      subtasks : {
        where : { deletedAt : null }
      }
    },

    orderBy : { createdAt : 'desc' },
  });

  // transfer for CSV
  const csvData = tasks.map(task => ({
    ID : task.id,
    Title : task.title,
    Description : task.description
    "Created At" : task.createdAt.toISOString(),
    "Due Date" : task.dueDate?.toISOString() || "",
    "Assigned To" : task.assignedUsers.map(u => `${u.profile.firstName} ${u.Profile.lastName}`).join(", "),
    "Subtask Count": task.subtasks.length,
  }))

  const parser = new Parser();
  const csv = parser.parse(csvData);

  return csv;
}

//------ Background Jobs And Queue 
//--- Schedule Task Reminders

async function sendDailyTaskReminders() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const tasksDue = await prisma.task.findMany({
    where : {
      dueDate : {
        gte : today,
        lt : tomorrow,
      },
      status : {
        not : 'COMPLETED',
      },
      deletedAt : null,
    },
    include : {
      assignedUsers : {
        select : {
          id : true,
          email : true,
        }
      }

      createdBy : {
        select : {
          email : true,
        }
      }
    }
  })

  // send reminders
  for(const task of taskDue){
    await prisma.Notification.createMany({
      data: task.assingedUsers.map(user => ({
        userId : user.id,
        type : '--',
        title : '--',
        message : '--',
        taskId : task.id
      }))
    })
  }
}

//-----------------------------------
// Mastery Advance patterns
//---------------------------------------

// pattern 1 : Cache-Aside Pattern with redis

import { Redis } from 'ioredis'

const redis = new Redis ({

})

// --- Write Through Caching
async function createTaskWithCache(userId: String, taskData : any){
  // create in database
  const task = await prisma.task.create({
    data: {
      ...taskData,
      createdById : userId, 
    },
    include : {
      createdBy : {
        select : {
          id : true,
          email : true,
        }
      }
    }
  })

  // write to cache
  const cacheService = new CacheService();
  await cacheService.set(
    'task:${task.id}',
    task,
    600 // 10 minute
  )

  // invalidate list cache
  await cacheService.invalidatePattern(`user:${userId}:tasks:*`);

  return task;
}

//--- Cache Stampede Prevention (Locking)
async function getTaskWithLockPrevention(taskId : string) {
  const cache = new CacheService();

  const cacheKey =  `task:${taskId}`;
  const lockKey = `${cacheKey}:lock`

  // try cache first 
  const cached = await cache.get(cacheKey);
  if(cached) return cached;

  // try to acquire lock
  const lock = await redis.set(lockKey, '1', 'NX', 'EX', 10);

  if(!lock){
    // another request is fetching -  wait and retry

    await new Promise(resolve => setTimeout(resolve, 1000));

    return getTaskWithLockPrevention(taskId);
  }

  try{
    // Double check cache (another reuqest might have populated it )
    const cachedRetry = await cache.get(cacheKey);
    if(cachedRetry) return cachedRetry;

    // Fetch from database
    const task = await prisma.task.findUnique({
      where : { id : taskId },
    })

    // Cache the result;
    await cache.set(cacheKey, task, 300);

    return task;
  }finally{
    // release lock
    await redis.delete(lockKey);
  }
}


//----------------------------------
// Database Indexing Strategies
//----------------------------------


//----------------------------------
// Prisma Foundation Query
//----------------------------------

model User {
  id  String  @id @default(uuid())
  email String  @unique
  phone  String? @unique
  password String
  role Role @default(USER)
  status  UserStatus @default(PENDING)

  // --- Relations
  // one user can create many task
  tasks Task[] @relation("TaskCreator")
  assignedTasks  Task[] @relation("AssignedTasks")
  Profile   UserProfile?
}

model UserProfile{
  id String @id @default(uuid())

  // one user can have one Profile
  userId String @unique
  user User @relation(fields: [userId], references: [id], onDelete : Cascade )

  firstName String
  lastName String

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt


}


model Task {
  id String @id @default(uuid())
  title String
  description String?
  status TaskStatus @default(PENDING)

  // one user can create  many task
  createdById String
  createdBy User @relation("TaskCreator", fields : [cretedById], references : [id])

  // one task can have one owner
  ownerId String?
  owner  User? @relation("TaskOwner", fields : [ownerId], references : [id])

  // one task can have many subTasks
  subtaks SubTask[]
}

model SubTask {
  id String @id @default(uuid())

  //--- relation
  taskId String
  task Task @relation(fields : [taskId], references: [id])
}



//------ Critical query pattern

// -- bad
const tasks = await prisma.task.findMany({
  where : {
    OR : [
      { status : 'pending' },
      { status : 'in_progress' }
    ]
  }
})


// -- good
const tasks = await prisma.task.findMany({
  where : {
    status:{
      in : ['PENDING', 'IN_Progress']
    }
  }
})

// Advanced : complex business logic
const tasks = await prisma.task.findMany({
  where : {
    AND : [
      {
        OR : [
          { status : 'inprogress'},
          {
            AND : [
              {status : 'pending'},
              { priority : { in : [ 'high', 'urgent' ]}}
            ]
          }
        ]
      },
      {
        OR : [
          { dueDate : { lte : new Date()}} // overdue
          {
            AND : [
              { dueDate : { gte : new Date() }},
              { startTime : { lte : new Date() }}
            ]
          }
        ]
      }
    ]
  }
})

// pagination patterns ( production ready)

// 1: -- offset based pagination (simple but slower)

interface OffsetPagination {
  page : number, 
  limit : number
}

async function getTasksOffset({page, limit}) : OffsetPagination {
  const skip = (page - 1) * limit;

  const [ tasks, total ] = await Promise.all([
    prisma.task.findMany({
      skip,
      take: limit,
      where : { deletedAt : null},
      include : {
        createdBy : {
          select : {
            id : true,
            email : true,
            profile : {
              select : {
                firstName : true,
                lastName : true
              }
            }
          }
        }
      },
      orderBy : { createdAt : 'desc' },

    })
  ])
}


// -- cursor based pagination

interface CursorPagination{
  limit : number;
  cursor ? : string;
  direction ? : 'forward' | 'backward';
}

async function getTasksCursor({ limit, cursor, direction = 'forward'} : CursorPagination){
  const tasks = await prisma.task.findMany({
    take : direction === 'forward' ? limit + 1 : -limit -1,
    skip : cursor ? 1 : 0 , // skip cursor itself
    cursor : cursor ? { id : cursor } : undefined,
    where : { deletedAt : null },
    include : {
      createdBy : {
        select : {
          id : true,
          email : true,
        }
      },
      _count : {
        select : {
          subtasks : true,
        }
      }
    } ,
    orderBy : { createdAt : 'desc'}
  })


  ---
  ---
  ---

  ---

  --
  ---
}


// -- advance relation and nested queries

// eager loading with selective fields
async function getTaskWithDetails (taskId : string){
  const task = await prisma.task.findUnique({
    where : { id : taskId},
    select : {
      id : true,
      description : true,
    },
    // nested relations with field selection
    createdBy: {
      select : {
        id: true,
        email : true,
        profile : {
          select: {
            firstName : true,
            lastName : true,
          }
        }
      }
    },

    assignedUsers : {
      select : {
        id :true,
        email : true,
        profile: {
          select :{
            firstName : true,
            lastName : true,
          }
        }
      }
    },

    subtasks : {
      where : { deletedAt : null },
      orderBy : { order : 'asc' },
      select : {
        id : true,
        title : true,
        isCompleted : true,
        order: true,
      }
    },

    _count : {
      select : {
        subtasks: true,
      }
    }
  })
}

// -- pattern 2 : Filtering relations
async function getUserWithActiveTasks(userId : string){
  const user = await prisma.user.findUnique({
    where : { id : userId },
    include : {
      // filter related records,
      tasks : {
        where : {
          status : {
            in: [ 'pending', 'inProgress' ]
          },
          deletedAt : null,
        },
        orderBy : { priority : 'desc'},
        take : 10, // limit result
      },
      
      assignedTasks : {
        where : {
          status : 'inProgress',
          deletedAt : null,
        },
        include : {
          createdBy : {
            select : {
              id: true, 
              email : true,
            }
          }
        }
      }
    }
  })
}
