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

