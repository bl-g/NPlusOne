package com.goosb.nplusone.rowupserts;

import static com.goosb.nplusone.rowupserts.RowUpsertsEventPublisher.RowUpsertsPublisherCloseReason.*;

import java.io.IOException;
import java.time.Duration;
import java.time.Instant;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.function.BiConsumer;
import java.util.function.Consumer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter.SseEventBuilder;
import org.springframework.web.util.DisconnectedClientHelper;

import com.goosb.nplusone.common.message.Debug;
import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.message.Info;
import com.goosb.nplusone.data.dto.RowUpserts;

/**
 * A publisher for one specific subscriber.
 * <p>
 * Each subscriber gets its own publisher to avoid other subscribers being affected by slow or unresponsive subscribers.
 */
public class RowUpsertsEventPublisher {

    public enum RowUpsertsPublisherCloseReason {
        WEBSERVICE_SHUTTING_DOWN,
        EMITTER_COMPLETED,
        EMITTER_TIMED_OUT,
        CLIENT_CLOSED_CONNECTION,
        OTHER_EMITTER_ERROR,
        EXECUTOR_ERROR,
    }

    private static final Logger logger = LoggerFactory.getLogger(RowUpsertsEventPublisher.class);

    private static final int EXECUTOR_POOL_SIZE = 1;
    private static final int EXECUTOR_KEEP_ALIVE_TIME_MS = 0;
    private static final long EMITTER_NO_TIME_OUT = 0L;

    private final long id;
    private final Instant subscribedAt;
    private final SseEmitter emitter;
    private final ThreadPoolExecutor executor;
    private final Consumer<RowUpsertsEventPublisher> onClosed;
    private final BiConsumer<RowUpsertsEventPublisher, Throwable> onRejectedExecution;

    private final Object closedMonitor = new Object();

    private boolean closed;

    public RowUpsertsEventPublisher(
            long id,
            Instant subscribedAt,
            Consumer<RowUpsertsEventPublisher> onClosed,
            BiConsumer<RowUpsertsEventPublisher, Throwable> onRejectedExecution,
            int executorQueueTasksCapacity) {
        this.id = id;
        this.subscribedAt = subscribedAt;
        this.onClosed = onClosed;
        this.onRejectedExecution = onRejectedExecution;

        this.emitter = new SseEmitter(EMITTER_NO_TIME_OUT);
        registerCloseCallbacks(emitter);

        ThreadFactory createThread = runnable -> {
            Thread thread = new Thread(runnable, "row-upsert-events-" + id);
            thread.setDaemon(true);
            return thread;
        };
        this.executor = new ThreadPoolExecutor(EXECUTOR_POOL_SIZE, EXECUTOR_POOL_SIZE, EXECUTOR_KEEP_ALIVE_TIME_MS, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(executorQueueTasksCapacity), createThread, new ThreadPoolExecutor.AbortPolicy());
    }

    private void registerCloseCallbacks(
            SseEmitter emitter) {
        emitter.onCompletion(() -> close(EMITTER_COMPLETED));
        emitter.onTimeout(() -> close(EMITTER_TIMED_OUT)); // redundant currently, since not using timeout
        emitter.onError(__ -> close(OTHER_EMITTER_ERROR));
    }

    //region api
    public void close(
            RowUpsertsPublisherCloseReason reason) {
        synchronized(closedMonitor) {
            if(closed) {
                return;
            }
            closed = true;
            long minutesAlive = Duration.between(subscribedAt, Instant.now()).toMinutes();
            logger.info(Info.REMOVED_SUBSCRIBER_A_AFTER_B_DUE_TO_C.getMessage(), id, minutesAlive, reason);
            executor.shutdownNow();
            onClosed.accept(this);
        }
    }

    public boolean publishHeartbeat() {
        SseEventBuilder heartbeatCommentEvent = SseEmitter.event().comment("heartbeat");
        return addEventToPublishQueue(heartbeatCommentEvent);
    }

    /**
     * @return {@code false} if this publisher is closed, thus should not receive any more updates
     */
    public boolean publishRowUpserts(
            RowUpserts rowUpserts) {
        SseEventBuilder rowUpsertsEvent = SseEmitter.event()
                .name("rows-upserts")
                .data(rowUpserts);
        return addEventToPublishQueue(rowUpsertsEvent);
    }

    public void completeEmitterWithError(
            Throwable error) {
        try {
            emitter.completeWithError(error);
        }
        catch(RuntimeException e) {
            logger.error(Error.FAILED_COMPLETE_EMITTER_A.getMessage(), id, e);
        }
    }

    public SseEmitter emitter() {
        return emitter;
    }
    //endregion

    private boolean addEventToPublishQueue(
            SseEventBuilder event) {
        RejectedExecutionException rejectedExecutionException;
        synchronized(closedMonitor) {
            if(closed) {
                return false;
            }
            try {
                executor.execute(() -> publishEvent(event));
                return true;
            }
            catch(RejectedExecutionException e) { // happens if (among other reasons) the queue is full
                rejectedExecutionException = e;
                logger.error(Error.EXECUTOR_A_REJECTED_PUBLISH_EVENT_TASK.format(id), rejectedExecutionException);
                close(EXECUTOR_ERROR);
            }
        }

        /*
        Complete the emitter (i.e., close the connection with the subscriber) on a different thread.
        This prevents the current thread from potentially waiting on the emitter's lock. For example:
        - Some other thread is using the emitter to send an event, thus holding the emitter's lock.
        - But to complete the emitter, the current thread needs to acquire the emitter's lock.
        - Thus it waits for the other thread (while holding the closedMonitor lock).
        To avoid this, closing the emitter happens outside of the synchronized block and on a different thread.
        */
        try {
            onRejectedExecution.accept(this, rejectedExecutionException);
        }
        catch(RuntimeException e) {
            logger.error(Error.FAILED_COMPLETE_EMITTER_A.getMessage(), id, e);
        }
        return false;
    }

    private void publishEvent(
            SseEmitter.SseEventBuilder event) {
        /* Don't acquire the closedMonitor-lock here, to avoid holding the lock while sending the event (which may block for a long time).
        Instead, accept that a race might happen here and skip logging any exception if there is indeed a race, to avoid confusing logs
        (whatever closed the emitter already logged its reason). */
        try {
            emitter.send(event);
        }
        catch(IOException | IllegalStateException e) {
            synchronized(closedMonitor) {
                if(closed) {
                    return;
                }
            }

            boolean clientClosedConnection = DisconnectedClientHelper.isClientDisconnectedException(e);
            if(clientClosedConnection) {
                logger.debug(Debug.SSE_SUBSCRIBER_A_DISCONNECTED.getMessage(), id, e);
            }
            else {
                logger.error(Debug.FAILED_SSE_DELIVERY_SUBSCRIBER_A.getMessage(), id, e);
            }

            close(clientClosedConnection ? CLIENT_CLOSED_CONNECTION : OTHER_EMITTER_ERROR);

            if(e instanceof IllegalStateException) { // not needed if IOException; emitter already completes itself in case of an IOE
                try {
                    emitter.completeWithError(e);
                }
                catch(RuntimeException e2) {
                    logger.error(Error.FAILED_COMPLETE_EMITTER_A.getMessage(), id, e2);
                }
            }
        }
    }

}
