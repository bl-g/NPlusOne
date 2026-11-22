package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.ConfigProperty;
import com.goosb.nplusone.common.message.Info;
import com.goosb.nplusone.data.dto.RowUpserts;
import com.goosb.nplusone.common.message.Debug;

import jakarta.annotation.PreDestroy;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatusCode;
import org.springframework.core.env.Environment;
import org.springframework.util.Assert;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;

@Service
public final class RowUpsertsEventPublishService {

    private static final Logger logger = LoggerFactory.getLogger(RowUpsertsEventPublishService.class);

    private static final HttpStatusCode SERVICE_UNAVAILABLE_STATUS = HttpStatusCode.valueOf(503);
    private static final long HEARTBEAT_INTERVAL_SECONDS = 15;
    private static final int DEFAULT_MAX_SUBSCRIBERS_COUNT = 10;
    private static final int DEFAULT_EXECUTOR_QUEUE_TASKS_CAPACITY = 10;

    private final int maxSubscribersCount;
    private final int executorQueueTasksCapacity;

    private final List<RowUpsertsEventPublisher> publishers = new CopyOnWriteArrayList<>();
    private final AtomicLong nextSubscriberId = new AtomicLong();

    private final ScheduledExecutorService heartBeatExecutor = createSingleDaemonThreadScheduledExecutor(
            "row-upsert-events-heartbeat");

    private final ScheduledExecutorService completeEmitterWithErrorExecutor = createSingleDaemonThreadScheduledExecutor(
            "row-upsert-events-complete-emitter-with-error");

    private final Object shuttingDownMonitor = new Object();

    private boolean isShuttingDown = false;

    public RowUpsertsEventPublishService(
            Environment environment) {
        this.maxSubscribersCount = environment.getProperty(
                ConfigProperty.LIVE_UPDATES_MAX_SUBSCRIBERS.getName(), Integer.class, DEFAULT_MAX_SUBSCRIBERS_COUNT);
        this.executorQueueTasksCapacity = environment.getProperty(
                ConfigProperty.LIVE_UPDATES_QUEUE_CAPACITY.getName(), Integer.class, DEFAULT_EXECUTOR_QUEUE_TASKS_CAPACITY);
        Assert.isTrue(maxSubscribersCount > 0,
                ConfigProperty.LIVE_UPDATES_MAX_SUBSCRIBERS.getName() + " must be greater than zero");
        Assert.isTrue(executorQueueTasksCapacity > 0,
                ConfigProperty.LIVE_UPDATES_QUEUE_CAPACITY.getName() + " must be greater than zero");
        this.heartBeatExecutor.scheduleAtFixedRate(this::publishHeartbeats, HEARTBEAT_INTERVAL_SECONDS, HEARTBEAT_INTERVAL_SECONDS,
                TimeUnit.SECONDS);
    }

    private static ScheduledExecutorService createSingleDaemonThreadScheduledExecutor(
            String threadName) {
        return Executors.newSingleThreadScheduledExecutor(runnable -> {
            Thread thread = new Thread(runnable, threadName);
            thread.setDaemon(true);
            return thread;
        });
    }

    /**
     * Sends heartbeat comment events to prevent anything on client-side from closing a seemingly abandoned connection
     */
    private void publishHeartbeats() {
        synchronized(shuttingDownMonitor) {
            if(isShuttingDown) {
                return;
            }
            for(RowUpsertsEventPublisher publisher : publishers) {
                boolean closed = !publisher.publishHeartbeat();
                if(closed) { // the onClosed-call back should prevent closed publishers from being in the list, but can happen in edge-cases
                    publishers.remove(publisher);
                }
            }
        }
    }

    public SseEmitter subscribe() {
        synchronized(shuttingDownMonitor) {
            if(isShuttingDown) {
                throw new ResponseStatusException(SERVICE_UNAVAILABLE_STATUS, Error.CANNOT_SUBSCRIBE_SERVICE_SHUTTING_DOWN.getMessage());
            }
            if(publishers.size() >= maxSubscribersCount) {
                throw new ResponseStatusException(SERVICE_UNAVAILABLE_STATUS,
                        Error.CANNOT_SUBSCRIBE_MAX_A_REACHED.format(maxSubscribersCount));
            }
            long id = nextSubscriberId.incrementAndGet();
            RowUpsertsEventPublisher publisher = new RowUpsertsEventPublisher(id, Instant.now(), publishers::remove,
                    this::completeEmitterWithError, executorQueueTasksCapacity);
            publishers.add(publisher);
            logger.info(Info.ADDED_SUBSCRIBER_A_NEW_TOTAL_B.getMessage(), id, publishers.size());
            publisher.publishHeartbeat();
            return publisher.emitter();
        }
    }

    private void completeEmitterWithError(
            RowUpsertsEventPublisher publisher,
            Throwable error) {
        synchronized(shuttingDownMonitor) {
            if(isShuttingDown) {
                return;
            }
            completeEmitterWithErrorExecutor.submit(() -> publisher.completeEmitterWithError(error));
        }
    }

    public void publish(
            RowUpserts rowUpserts) {
        if(rowUpserts.isEmpty()) {
            return;
        }

        synchronized(shuttingDownMonitor) {
            if(isShuttingDown) {
                return;
            }
            logger.debug(Debug.PUBLISHING_RUNTIME_ROWS_A_SUBSCRIBERS_B.getMessage(), rowUpserts.rowCount(), publishers.size());
            for(RowUpsertsEventPublisher publisher : publishers) {
                boolean closed = !publisher.publishRowUpserts(rowUpserts);
                if(closed) { // the onClosed-call back should prevent closed publishers from being in the list, but can happen in edge-cases
                    publishers.remove(publisher);
                }
            }
        }
    }

    @PreDestroy
    void stop() {
        synchronized(shuttingDownMonitor) {
            if(isShuttingDown) {
                return;
            }
            isShuttingDown = true;
            logger.debug(Debug.SHUTTING_DOWN.getMessage());
            for(RowUpsertsEventPublisher publisher : publishers) {
                publisher.close(RowUpsertsEventPublisher.RowUpsertsPublisherCloseReason.WEBSERVICE_SHUTTING_DOWN);
            }
            publishers.clear();
            heartBeatExecutor.shutdown();
            completeEmitterWithErrorExecutor.shutdown();
        }
    }
}
