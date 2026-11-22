package com.goosb.nplusone.rowupserts;

import com.goosb.nplusone.data.dto.RowUpsertsPage;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.time.Instant;

@RestController
@RequestMapping("/api/rows")
public final class RowUpsertsController {

    private final RowUpsertsEventPublishService eventPublisher;
    private final RowUpsertsService service;

    public RowUpsertsController(
            RowUpsertsEventPublishService eventPublisher,
            RowUpsertsService service) {
        this.eventPublisher = eventPublisher;
        this.service = service;
    }

    @GetMapping(path = "/live", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    public SseEmitter liveStream() {
        return eventPublisher.subscribe();
    }

    @GetMapping(path = "/search-page")
    public RowUpsertsPage searchPage(
            @RequestParam(required = false) Instant startDate,
            @RequestParam(required = false) Instant endDate,
            @RequestParam(required = false) String cursor,
            @RequestParam(defaultValue = "100") int pageSize) {
        return service.findRowUpsertsPaginated(startDate, endDate, cursor, pageSize);
    }
}
