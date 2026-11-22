package com.goosb.nplusone.test.attributes;

/**
 * Selects the stack frames/origins whose SQLs should be included when counting N+1 patterns.
 * Note: the check is per frame. Only one frame has to match/be included for a stack frame to be included.
 * <p>
 * <b>Note:</b> implementations must be public and have a public no-argument constructor.
 */
@FunctionalInterface
public interface StackFrameFilter {

    /**
     * @param formattedFrame one application frame formatted as {@code at fully.qualified.ClassName.methodName(FileName.java:lineNumber)}
     * @return {@code true} if this is a frame whose stack should be considered by NPlusOne, otherwise {@code false}
     */
    boolean include(
            String formattedFrame);
}
