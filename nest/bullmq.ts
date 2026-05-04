// installation and module setup

/*

npm install bullmq ioredis
npm install --save-dev @types/ioredis

*/

// bullmq.module.ts
import { Module, DynamicModule, Global } from '@nestjs/common'
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

@Global()
@Module({
    imports : [],
    providers : [],
    exports : [],
})
export class BullmqModule{
    static forRoot() : DynamicModule {
        return {
            module : BullmqModule,
            imports : [
                BullModule.forRootAsync({
                    imports : [ConfigModule],
                    useFactory : async(configService :ConfigService) =>({
                        // redis connection
                        connection : {
                            host: configService.get('REDIS_HOST', 'localhost'),
                            port : configService.get('REDIS_PORT', 6379),
                            password :configService.get('REDIS_PASSWORD'),
                            db : configService.get('REDIS_DB', 0),

                            // connection pooling
                            maxRetriesPerRequest : null, // required for Bullmq
                            retryStrategy : (times : number) => {
                                if(times > 3) {
                                    console.error('Redis connection failed after 3 retries')
                                    return null;
                                }
                                return Math.min(times * 50, 2000);
                            }
                        }

                        // default job operation
                        defaultJobOperation : {
                            attempts : 3,  // retry 3 times on failure
                            backoff: {
                                type : 'exponential',
                                delay : 2000, // start with 2s delay
                            },
                            removeOnComplete : {
                                count : 100, // keep last 100 completed jobs
                            },
                            removeOnFail : {
                                count : 500, // keep last 500 failed jobs
                            }
                        },

                    }),
                    inject : [ConfigService],
                })
            ],
            exports : [BullModule],
        }
    }
}

// .env
REDIS_HOST=
REDIS_PORT=
REDIS_PASSWORD=
REDIS_DB=0
//-----

export const QueueNames = {
    EMAIL : 'email',
    NOTIFICATION : 'notification',
} as const;

export type QueueName = typeof QueueNames[keyof typeof QueueNames];

// queue-options.ts - Queue-Specific Options
import { QueueOptions } from 'bullmq';

export const QueueOptions : Record<QueueName, Partial<QueueOptions>> = {
    [QueueNames.EMAIL] : {
        defaultJobOptions : {
            attempt : 5, // emails are important, retry more
            backoff: {
                type : 'exponential',
                delay : 3000,
            },
            removeOnComplete : { count : 200 },
            removeOnFail : { count : 1000 },
            timeout : 30000, // 30 second timeout
        }
    },

    [QueueNames.NOTIFICATION] : {
        defaultJobOptions : {
            attempts : 3, 
            backoff : {
                type: 'fixed',
                delay : 2000,
            },
            removeOnComplete : { count : 100 }, // keep not longer as its not important for auditing
            removeOnFail : { count : 500 },
            timeout : 10000, // 10 second timeout as normal processing
        }
    }
}

// ===== Producer Pattern

// === Queue Service Wrapper

import { Injectable, Inject } from '@nestjs/common';
import { Queue } from 'bullmq';
import { QueueNames } from './queues';

@Injectable()
export class QueueService {
    constructor(
        @Inject(QueueNames.EMAIL) private emailQueue : Queue,
        @Inject(QueueNames.NOTIFICATION) private notificationQueue: Queue,
    ){}

    // email jobs
    async sendWelcomeEmail(userId : string, email: string) : Promise<string>{
        const job = await this.emailQueue.add(
            'send-welcome-email',
            {
                userId,
                email,
                template : 'welcome',
            },
            {
                jobId : `welcome:${userId}`, // unique job ID (prevents duplicates)
                priority : 1, // high priority for welcome emails
            }
        );

        return job.id;
    }
    
    async sendPasswordResetEmail(userId : string, email: string, token: string){
        const job = await this.emailQueue.add(
            'send-password-reset',
            {
                userId,
                email,
                token,
                template : 'password-reset',
            },
            {
                jobId : `reset:${userId}:${Date.now()}`,
                priority : 2, // highest priority
            }
        )

        return job.id;
    }

    async sendNotificationEmail(
        userId: string,
        email : string,
        subject : string,
        body : string
    ):Promise<string>{
        const job = await this.emailQueue.add(
            'send-notification',
            {
                userId,
                email,
                subject, 
                body,
                template : 'notification',
            },
            {
                jobId: `notif:${userId}:${Date.now()}`,
                priority : 3 , // normal priority
            }

        )
    }
    
    // delayed jobs
    async scheduleReminderEmail(
        userId: string,
        email : string,
        reminderTime : Date,
        message : string
    ): Promise<string>{
        const delay = reminderTime.getTime() - Date.now();

        if(delay <=0){
            throw new Error("Reminder time must be in the future")
        }

        const job = await this.emailQueue.add(
            'send-reminder',
            {
                userId,
                email,
                message,
            },
            {
                jobId : `reminder:${userId}:${reminderTime.getTime()}`,
                delay, // delay in milliseconds
                priority : 2,
            }
        )

        return job.id;
    }
}


// ---------- Queue module registration
// -- queue / queue.module.ts
import {Module} from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { QueueNames, QueueOptions } from './queues';
import { QueueService } from './queue.service';

@Module({
    imports : [
        // Register all queue
        BullModule.registerQueue(
            {
                name: QueueNames.EMAIL,
                ...QueueOptions[QueueNames.EMAIL]
            },
            {
                name : QueueNames.NOTIFICATION,
                ...QueueOptions[QueueNames.NOTIFICATION]
            }
        )
    ],
    providers : [QueueService],
    exports : [ QueueService, BullModule]
})
export class QueueModule { }

// #---------- Consumer pattern (workers)
// email processor
import { Process, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { QueueNames } from '../queues';
import { EmailService } from '../email/email.service';

@Processor(QueueNames.EMAIL)
export class EmailProcessor {
    private readonly logger = new Logger(EmailProcessor.name)

    constructor(private emailService : EmailService){}

    @Process('send-welcome-email')
    async processWelcomeEmail(job: Job<any>){
        const { userId, email } = job.data;

        this.logger.log(`Processing welcome email for user ${userId}`)
        try {
            // update progress
            await job.updateProgress(10);

            // get user data
            await job.updateProgress(30);

            // send email
            await this.emailService.sendWelcome(email);
            await job.updateProgress(80);

            // log success
            await job.updateProgress(100);

            this.logger.log('welcome email sent successfully')
        }catch (error){
            this.logger.error('failed to send welcome email')
            throw error;
        }
    }
}

// Payment Processor
import { Process, Processor } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { Queuenames } from '../queues';
import { PaymentService } from '../payment/payment.service';
import { NotificationService } from '../notification/notification.service.ts'

@Processor(QueueNames.PAYMENT)
export class PaymentProcessor {
    private readonly logger = new Logger(PaymentProcessor.name);

    constructor(
        private paymentService : PaymentService,
        private notificationService : NotificationService
    ){}

    @Process('process-payment')
    async processPayment(job: Job<any>){
        const { userId, paymentId, amount, paymentMethod } =  job.data;

        this.logger.log('Processing payment ..id .. for user .. userId')

        try { 
            // step 1 : validate payment
            await job.updateProgress(10);
            const isValid = await this.paymentService.validatePayment(paymentId);

            if(!isValid){
                throw new Error('Invalid Payment details')
            }

            // 2. charge payment
            await job.updateProgress(30);
            const result = await this.paymentService.charge({
                paymentId,
                amount,
                paymentMethod,
            })

            // 3 : update database 
            await job.updateProgress(60)
            
            await this.paymentService.recordPayment({
                paymentId,
                userId,
                amount,
                status: 'completed',
                transactionId : result.transactionid,
            })
        }
    }
}



// =========== 845 number line 





















