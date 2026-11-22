package com.goosb.nplusone.test.attributes;

public final class IncludeAllSql implements SqlFilter {

    @Override
    public boolean include(
            String sql) {
        return true;
    }
}
