package com.goosb.nplusone.gradle;

import org.gradle.api.provider.Property;

public abstract class NPlusOneExtension {

    public abstract Property<Boolean> getEnabled();

    public abstract Property<String> getNplusoneVersion();

    public abstract Property<String> getApplicationPackagePrefixes();
}
