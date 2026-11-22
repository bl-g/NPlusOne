package com.goosb.nplusone.data.dto;

import com.goosb.nplusone.util.EncodingUtil;

import java.util.ArrayList;
import java.util.List;

public record RowUpsertsPage(
        RowUpserts rowUpserts,
        String nextCursor) {

    public boolean isLastPage() {
        return nextCursor == null;
    }

    public RowUpsertsPage merge(
            RowUpsertsPage nextPage,
            int pageSize) {
        if(nextPage.rowUpserts.rowCount() == 0) {
            return new RowUpsertsPage(rowUpserts, nextPage.nextCursor);
        }

        List<Row> bothPagesRows = new ArrayList<>(rowUpserts.rows());
        bothPagesRows.addAll(nextPage.rowUpserts.rows());
        List<Row> mergedRows = bothPagesRows.stream().limit(pageSize).toList();

        boolean noMoreRowsAvailable = nextPage.isLastPage() && bothPagesRows.size() <= pageSize;
        String mergedNextCursor = noMoreRowsAvailable ? null : EncodingUtil.toBase64(mergedRows.get(mergedRows.size() - 1).cursor());

        return new RowUpsertsPage(new RowUpserts(mergedRows), mergedNextCursor);
    }
}
