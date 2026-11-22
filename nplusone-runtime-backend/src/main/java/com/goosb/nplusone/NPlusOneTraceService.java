package com.goosb.nplusone;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.message.Info;
import com.goosb.nplusone.logging.MDCKey;
import com.goosb.nplusone.rowupserts.RowUpsertsService;
import io.grpc.stub.StreamObserver;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
import io.opentelemetry.proto.collector.trace.v1.ExportTraceServiceResponse;
import io.opentelemetry.proto.collector.trace.v1.TraceServiceGrpc;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;

import java.util.concurrent.ThreadLocalRandom;

@Service
public final class NPlusOneTraceService extends TraceServiceGrpc.TraceServiceImplBase {

    private static final Logger logger = LoggerFactory.getLogger(NPlusOneTraceService.class);

    private static final ThreadLocalRandom RANDOM = ThreadLocalRandom.current();

    private final RowUpsertsService rowUpsertsService;

    public NPlusOneTraceService(
            RowUpsertsService rowUpsertsService) {
        this.rowUpsertsService = rowUpsertsService;
    }

    /**
     * Imports/processes the spans contained in the given {@code request}.
     * <p>
     * Note: the method name {@code export} is from the perspective of the client (the Java agent in the standard setup):
     * the client exports traces (and their spans) to this app (through the embedded gRPC server).
     */
    @Override
    public void export(
            ExportTraceServiceRequest request,
            StreamObserver<ExportTraceServiceResponse> responseObserver) {
        try {
            String requestId = "%08x".formatted(RANDOM.nextInt());
            MDC.put(MDCKey.CONTEXT.getKeyName(), "[otlp-export] [%s]".formatted(requestId));
            importSpans(request, responseObserver);
        }
        finally {
            MDC.clear();
        }
    }

    private void importSpans(
            ExportTraceServiceRequest request,
            StreamObserver<ExportTraceServiceResponse> responseObserver) {
        logger.info(Info.RECEIVED_TRACE_EXPORT.getMessage());

        try {
            long startMillis = System.currentTimeMillis();
            long startedProcessingMillis = rowUpsertsService.saveAndPublishSpans(request);
            long endMillis = System.currentTimeMillis();
            logger.info(Info.FINISHED_TRACE_EXPORT_RUN_TIME_A_WAIT_TIME_B.getMessage(),
                    endMillis - startedProcessingMillis, startedProcessingMillis - startMillis);
        }
        catch(RuntimeException e) {
            logger.error(Error.FAILED_TO_PROCESS_TRACE_EXPORT.getMessage(), e);
            responseObserver.onError(e);
            return;
        }

        try {
            // the proto file defines this as a unary RPC, so return a single (empty) response message
            responseObserver.onNext(ExportTraceServiceResponse.getDefaultInstance());
        }
        catch(RuntimeException e) {
            responseObserver.onError(e);
            throw e; // StreamObserver's JavaDoc recommends propagating exceptions thrown by onNext()
        }

        responseObserver.onCompleted(); // terminal operation, so do not call onError() if it throws
    }
}