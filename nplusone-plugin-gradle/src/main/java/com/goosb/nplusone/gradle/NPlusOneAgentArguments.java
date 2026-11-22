package com.goosb.nplusone.gradle;

import org.gradle.api.file.ConfigurableFileCollection;
import org.gradle.api.provider.Property;
import org.gradle.api.tasks.Classpath;
import org.gradle.api.tasks.Input;
import org.gradle.process.CommandLineArgumentProvider;

import java.util.Collections;
import java.util.List;

public abstract class NPlusOneAgentArguments implements CommandLineArgumentProvider {

    @Classpath
    public abstract ConfigurableFileCollection getAgentClasspath();

    @Input
    public abstract Property<Boolean> getEnabled();

    @Override
    public Iterable<String> asArguments() {
        if(!getEnabled().get()) {
            return Collections.emptyList();
        }
        String agentFilePath = getAgentClasspath().getSingleFile().getAbsoluteFile().getAbsolutePath();
        return List.of("-javaagent:" + agentFilePath);
    }
}
