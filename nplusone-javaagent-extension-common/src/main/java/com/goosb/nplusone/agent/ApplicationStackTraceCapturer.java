package com.goosb.nplusone.agent;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.common.message.Error;
import com.goosb.nplusone.common.StringsUtil;

import java.util.List;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

import org.jspecify.annotations.Nullable;

public final class ApplicationStackTraceCapturer {

    public record ApplicationStackTrace(
            String id,
            String stackTrace) {

        private static ApplicationStackTrace empty() {
            return new ApplicationStackTrace("", "");
        }
    }

    public static final String STACK_FRAME_FORMAT_PREFIX = "at ";

    private static final Set<String> DEFAULT_EXCLUDED_PREFIXES = Set.of(
            ApplicationStackTraceCapturer.class.getName(),
            "com.goosb.nplusone.",
            "io.opentelemetry.",
            "java.",
            "jdk.",
            "sun.",
            "com.sun.",
            "com.microsoft.sqlserver.jdbc.",
            "com.mysql.",
            "oracle.jdbc.",
            "org.h2.",
            "org.hibernate.",
            "org.postgresql.",
            "org.springframework.",
            "org.apache.openjpa.");
    private static final String INCLUDE_ALL_PACKAGES = "*";
    private static final String REGEX_DOT = "\\.";

    private final Predicate<String> includeClass;
    private final int maxStackFrames;

    //region create instance
    public ApplicationStackTraceCapturer(
            @Nullable List<String> applicationPackagePrefixes,
            int maxStackFrames) {
        if(maxStackFrames < 1) {
            throw new IllegalArgumentException(Error.MAX_STACK_FRAMES_MUST_BE_POSITIVE.getMessage());
        }
        this.maxStackFrames = maxStackFrames;
        this.includeClass = createIncludeClassPredicate(applicationPackagePrefixes);
    }

    private static Predicate<String> createIncludeClassPredicate(
            @Nullable List<String> packagePrefixes) {
        if(packagePrefixes == null || packagePrefixes.isEmpty()) {
            return className -> DEFAULT_EXCLUDED_PREFIXES.stream()
                    .noneMatch(className::startsWith);
        }

        Set<String> trimmedPrefixes = packagePrefixes.stream()
                .filter(prefix -> !isBlank(prefix))
                .map(String::trim)
                .collect(Collectors.toSet());

        if(trimmedPrefixes.contains(INCLUDE_ALL_PACKAGES)) {
            if(trimmedPrefixes.size() != 1) {
                throw new IllegalArgumentException(Error.INVALID_APPLICATION_PACKAGE_PREFIXES_A.format(
                        String.join(", ", packagePrefixes)));
            }
            return className -> true;
        }

        Set<String> normalizedPrefixes = trimmedPrefixes.stream()
                .map(prefix -> {
                    String normalizedPrefix = removeTrailingDots(prefix);
                    for(String segment : normalizedPrefix.split(REGEX_DOT, -1)) {
                        if(!isValidPackageSegment(segment)) {
                            throw new IllegalArgumentException(Error.INVALID_APPLICATION_PACKAGE_PREFIXES_A.format(
                                    String.join(", ", packagePrefixes)));
                        }
                    }
                    // always adding the dot is intended: if a user gives 'com.foo', then this should not match 'com.foobar'
                    return normalizedPrefix + ".";
                })
                .collect(Collectors.toSet());

        return className -> normalizedPrefixes.stream()
                .anyMatch(className::startsWith);
    }

    private static String removeTrailingDots(
            String packageName) {
        int i = packageName.length();

        while(i > 0 && packageName.charAt(i - 1) == '.') {
            i--;
        }

        return packageName.substring(0, i);
    }

    private static boolean isValidPackageSegment(
            String value) {
        if(isBlank(value)) {
            return false;
        }
        return Character.isJavaIdentifierStart(value.codePointAt(0)) && value.codePoints()
                .skip(1)
                .allMatch(Character::isJavaIdentifierPart);
    }

    //endregion

    //region capture
    public ApplicationStackTrace captureCurrentStacktrace() {
        List<ApplicationStackFrame> applicationStackFrames = findApplicationStackFrames(maxStackFrames);
        if(applicationStackFrames.isEmpty()) {
            return ApplicationStackTrace.empty();
        }

        String stackTraceString = applicationStackFrames.stream()
                .map(ApplicationStackFrame::formatted)
                .collect(Collectors.joining(System.lineSeparator()));
        String stackTraceId = StringsUtil.hash(stackTraceString);

        return new ApplicationStackTrace(stackTraceId, stackTraceString);
    }

    private List<ApplicationStackFrame> findApplicationStackFrames(
            int maxStackFrames) {
        return StackWalker.getInstance().walk(stackFrames -> stackFrames
                .filter(this::isApplicationStackFrame)
                .limit(maxStackFrames)
                .map(ApplicationStackFrame::from)
                .toList());
    }

    private boolean isApplicationStackFrame(
            StackWalker.StackFrame stackFrame) {
        return includeClass.test(stackFrame.getClassName());
    }
    //endregion

    private record ApplicationStackFrame(
            String className,
            String methodName,
            String fileName,
            int lineNumber) {

        private static ApplicationStackFrame from(
                StackWalker.StackFrame frame) {
            return new ApplicationStackFrame(
                    frame.getClassName(),
                    frame.getMethodName(),
                    frame.getFileName(),
                    frame.getLineNumber());
        }

        private String formatted() {
            return (STACK_FRAME_FORMAT_PREFIX + "%s(%s)").formatted(functionName(), sourceLocation());
        }

        private String functionName() {
            return className + "." + methodName;
        }

        private String sourceLocation() {
            if(isBlank(fileName)) {
                return "Unknown";
            }

            if(lineNumber < 0) {
                return fileName;
            }

            return fileName + ":" + lineNumber;
        }
    }
}
