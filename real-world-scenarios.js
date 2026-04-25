// parent dashboard - get all children tasks

interface DashboardFilters {
    status? :  'all' | 'pending' | 'in_progress'
    taskType : 'children' | 'parent'
}

async function getTaskDashboard(
    businessUserId : string,
    filters : DashboardFilters
) {
    const {
        status = 'all',
        taskType = 'children',
        page = 1,
        limit = 20,
        sortBy = '-startTime'
    } = filters;

    // get all children for this business user
    const children = await prisma.childrenBusinessUser.findMany({
        where : {
            parentBusinessUserId : businessUserId,
            status : 'ACTIVE',
            deletedAt : null
        },
        select : {
            childUserId : true
        },
    })

    const childUserIds = children.map(c => c.childUserId);

    // build query based on taskType
    let whereClause: any = { deletedAt : null };

    if(taskType == 'personal'){
        // parents personal tasks
        whereClause = {
            ...whereClause,
            ownerId : businessUserId,
            taskType : 'PERSONAL'
        }
    }else{
        // childreans tasks
        whereClause.assignedUserIds = {
            in : childUserIds
        }
    }

    // apply status filter
    if(status !== 'all'){
        whereClause.status = status
    }

    // executed paginated query

    const [tasks, total] = await Promise.all([
        prisma.task.findMany({
            where : whereClause,
            skip : (page - 1) * limit,
            take : limit,
            include : {
                assignedUsers : {
                    select : {
                        id : true,
                        email : true,
                        profile : {
                            select : {
                                firstName : true,
                                lastName : true,
                                avatarUrl : true
                            }
                        },

                        // include progress for collaborative tasks
                        taskProgress : {
                            where : { deletedAt : null},
                            select : {
                                status : true,
                                progressPercentage : true,
                                completedSubtaskCount : true,
                            }
                        }
                    }
                },
                createdBy : {
                    select : {
                        id : true,
                        email : true, 
                        profile : {
                            select:{
                                firstName : true,
                                lastName :true,
                            }
                        }
                    }
                },
                subtasks : {
                    where : {deletedAt : null},
                    orderBy : { order : 'asc'}
                },
                _count : {
                    select : {
                        subtasks : true,
                    }
                }
            }
        })

        prisma.task.count({
            where : whereClause,
        })
    ])


    // get status count for dashboard tabs
    const statusCounts = await prisma.task.groupBy({
        by: ['status'],
        where : whereClause,
        _count : true,
    })
}

// User management and authentication

// complete user registration flow
interface RegisterUserDTO{
    email 
    pass
    role : 'dsd' 
    profile : {
        firstName : 
        lastName : 
    }
}

async function registerUser(data : RegisterUserDTO) {
    return prisma.$transaction(async (tx)=> {
        // check if the email exist
        const existing = await tx.user.findUnique({
            where : { email : data.email } 
        })

        if(existing){
            throw new ConflictExecption('Email already registered')
        }

        // hash password
        const hashedPassword = await bcrypt.hash(data.password, 10)

        // create user with profile 

        const user = await tx.user.create({
            data :{
                email: data.email
                
                profile : {
                    create : {
                        firstName  : data.profile.name
                    }
                }

            },
            include : {
                profile : true,
            }
        })

        // create verification token 
        const verificationToken = crypto.randomBytes(32).toString('hex')

        await tx.verificationToken.create({
            data: {
                userId : user.id,
                token : verificationToken,
                type : 'EMAIL_VERIFICAITON',
                expiresAt : new Date(Date.now())
            }
        })

        })
}



// get user profile with task analytics
async function getUserWithAnalytics(userId : string){
    const user = await prisma.user.findUnique({
        where : { id :  userId},
        include : {
            profile : {
                select : {
                    firstName : true,
                    lastName : true,
                    avatarUrl : true,
                    bio : true,
                }
            },

            // task statistics via aggregation
            tasks: {
                select : {
                    status : true, 
                    priority : true,
                    createdAt : true,
                },
                where : {
                    deletedAt : null,
                }
            },

            assignedTasks : {
                where : { deletedAt : null},
                _count : true,
            }

            // task statistics via aggregation
        }
    })

    // calculate statistics
    const stats = {
        totalTasks : user.tasks.length,
        byStatus : user.tasks.reduce((acc, task) => {
            acc[task.status] = (acc[task.status] || 0) + 1;
        }, {} as Record<String,number>)
        byPriority : user.tasks.reduce((acc, tsak) => {
            acc[task.priority] = (acc[task.priority] || 0) + 1;
        }),
        completionRate : user.tasks.length > 0 ?
            Math.round(
                (user.tasks.filter(t => t.status ==' completed').length) / 
            )
    }
}

// Collaborative features and permission
// permission checking middleware

enum Permission {
    view = 'view',
    edit = 'edit',
    delete = 'delete',
    assign = 'assign'
}

async function checkTaskPermission(
    userId,
    taskId,
    requiredPermission : Permission
){
    const task = await prisma.task.findUnique({
        where : {id : taskId},
        select : {
            createdById : true,
            ownerId : true,
            taskType : true,
            assignedUsers : {
                select : {
                    id : true,
                }
            }
        }
    })

    if(!task){

    }

    // owner / creator has all permission
    if(task.createdById == userId || task.ownerId == userId){
        return true
    }

    const isAssigned = task.assignedUsers.some(u => u.id == userId);

    if(!isAssinged) {
        throw new  
    }

    switch(requiredPermission) {
        case Permission.view:
            return true;
        case Permission.edit: 
            return task.createdById === userId

        default:
            return false
    }
}


// updateTask

async function updateTask(
    userId : String,
    taskId : String,
    data : any
){
    await checkTaskPermission(userId, taskId, Permission.Edit)

    return prisma.task.update({
        where : { id : taskId},
        data
    })
}

// collaborative task progress 
-- update individual progress on collaborative task 
interface updteProgressDTO {
    status : 'not-started' | 'in-progress' | 'completed'
    completedSubTaskIndexes : number[],
    note: string
}

async function updateMyTaskProgress(
    taskId : String,
    userId : string,
    data: UpdateProgressDTO
){
    return prisma.$transaction(async(tx) => {
        // verify task is collaborative
        const task = await tx.task.findUnique({
            where : {id : taskId},
            select : { taskType : true, assignedUserIds : true}
        })

        if(task.taskType !== 'collaborative'){
            error
        }

        // verify user is assigned
        if(!task.assignedUserIds.includes(userId)){
            erro
        }

        // update progress records
        const progress = await tx.taskProgress.upsert({
            where : {
                taskId_userId : {
                    taskId,
                    userId,
                }
            },
            update : {
                status : data.status,
                completedSubTaskIndexes : data.completedSubTaskIndexes || [,],
                progressPercentage : data.completedSubTaskIndexes ? 
            }
        })
    })
}

// ====================>

const allProgress = await tx.taskProgress.findMany({
    where : { taskId, deletedAt : null},
})

const alCompleted = allProgress.every(p => p.status === 'COMPLETED');
const anyInProgress = allProgress.some(p => p.status == 'progress')

if(allCompleted && task.status !== 'completed'){
    await tx.task.update({
        where : { id : taskId },
        data : {
            status : 'COMPLETED',
            completedAt : new Date(),
        }
    })
}else if ( anyInProgress && task.status == 'pending') {
    await tx.task.update({
        where : { id : taskId}, 
        data : {
            status : 'in_progress'
        }
    })
}

//-------- 4. notification system .. ---> notification creation

interface 