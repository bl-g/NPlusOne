package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.common.message.Debug;
import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.data.RowCursor;
import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.data.dto.RowUpserts;
import com.goosb.nplusone.data.dto.RowUpsertsPage;
import com.goosb.nplusone.exception.RequestValidationException;
import com.goosb.nplusone.util.EncodingUtil;

import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

@Service
public final class RowUpsertsService {

    private static final Logger logger = LoggerFactory.getLogger(RowUpsertsService.class);
    private static final int MAX_PAGE_SIZE = 1_000;

    private final RowUpsertsRepository repository;
    private final RowUpsertsEventPublishService eventPublisher;

    public RowUpsertsService(
            RowUpsertsRepository repository,
            RowUpsertsEventPublishService eventPublisher) {
        this.repository = repository;
        this.eventPublisher = eventPublisher;
    }

    /**
     * Saves the spans held by the given {@code request}, along with the stack traces and SQL queries held by them.
     * Then publishes all new and updated rows to the live-listeners.
     *
     * @return the epoch millis at which this method actually started executing (after acquiring the lock)
     */
    public synchronized long saveAndPublishSpans(
            ExportTraceServiceRequest request) {
        long startMillis = System.currentTimeMillis();
        logger.debug(Debug.STARTED_PROCESSING_TRACE_EXPORT.getMessage());
        RowUpserts rowUpserts = repository.saveSpans(request);
        eventPublisher.publish(rowUpserts);
        return startMillis;
    }

    //region findRowUpsertsPaginated
    public RowUpsertsPage findRowUpsertsPaginated(
            Instant startDate,
            Instant endDate,
            String encodedCursor,
            int pageSize) {
        List<String> errors = validate(startDate, endDate, encodedCursor, pageSize);
        if(!errors.isEmpty()) {
            throw new RequestValidationException(errors);
        }

        RowCursor cursor = encodedCursor == null ? null : EncodingUtil.fromBase64(encodedCursor);
        return repository.findRowUpsertsPaginated(startDate, endDate, cursor, pageSize);
    }

    private static List<String> validate(
            Instant startDate,
            Instant endDate,
            String encodedCursor,
            int pageSize) {
        List<String> errors = new ArrayList<>();
        validateDateRange(startDate, endDate)
                .ifPresent(errors::add);
        validatePageSize(pageSize)
                .ifPresent(errors::add);
        if(encodedCursor != null) {
            validateCursor(encodedCursor)
                    .ifPresent(errors::add);
        }
        return errors;
    }

    private static Optional<String> validateDateRange(
            Instant startDate,
            Instant endDate) {
        if(startDate != null
                && endDate != null
                && startDate.isAfter(endDate)) {
            return Optional.of(Error.START_DATE_MUST_NOT_BE_AFTER_END_DATE.getMessage());
        }
        return Optional.empty();
    }

    private static Optional<String> validatePageSize(
            int pageSize) {
        if(pageSize < 1) {
            return Optional.of(Error.PAGE_SIZE_MUST_BE_AT_LEAST_ONE.getMessage());
        }
        if(pageSize > MAX_PAGE_SIZE) {
            return Optional.of(Error.PAGE_SIZE_MUST_NOT_EXCEED_A.format(MAX_PAGE_SIZE));
        }
        return Optional.empty();
    }

    private static Optional<String> validateCursor(
            String encodedCursor) {
        try {
            RowCursor cursor = EncodingUtil.fromBase64(encodedCursor);
            if(cursor == null
                    || cursor.start() == null
                    || cursor.rowType() == null
                    || isBlank(cursor.traceId())
                    || isBlank(cursor.spanId())) {
                return Optional.of(Error.CURSOR_IS_INVALID.getMessage());
            }
            return Optional.empty();
        }
        catch(IllegalArgumentException e) {
            return Optional.of(Error.CURSOR_IS_INVALID.getMessage());
        }
    }
    //endregion
}
