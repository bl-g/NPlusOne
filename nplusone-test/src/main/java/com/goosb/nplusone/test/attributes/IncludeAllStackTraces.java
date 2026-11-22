package com.goosb.nplusone.test.attributes;

public final class IncludeAllStackTraces implements StackFrameFilter {

    @Override
    public boolean include(
            String applicationStackFrame) {
        return true;
    }
}
