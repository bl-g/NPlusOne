package com.goosb.nplusone.gradle;

import com.goosb.nplusone.common.ConfigProperty;
import com.goosb.nplusone.common.Version;
import com.goosb.nplusone.common.plugin.BuildId;
import com.goosb.nplusone.common.plugin.OTel;
import org.gradle.api.Plugin;
import org.gradle.api.Project;
import org.gradle.api.artifacts.Configuration;
import org.gradle.api.provider.Property;
import org.gradle.api.provider.Provider;
import org.gradle.api.tasks.testing.Test;

import java.util.Map;

/**
 * Attaches the N+1 agent to all Gradle Test tasks. Consumers choose a JUnit integration library.
 */
public final class NPlusOneGradlePlugin implements Plugin<Project> {

    private static final String NPLUSONE_EXTENSION_NAME = "nplusone";
    private static final String TEST_AGENT_CONFIG_NAME = "nplusoneTestJavaagent";

    @Override
    public void apply(
            Project project) {
        // Configure test tasks after the Java plugin has been applied.
        project.getPluginManager().withPlugin("java", __ -> configureNPlusOne(project));
    }

    private void configureNPlusOne(
            Project project) {
        NPlusOneExtension extension = project.getExtensions().create(NPLUSONE_EXTENSION_NAME, NPlusOneExtension.class);
        extension.getEnabled().convention(true);
        extension.getNplusoneVersion().convention(Version.CURRENT.getValue());

        Configuration testAgentConfig = project.getConfigurations().create(TEST_AGENT_CONFIG_NAME, config -> {
            config.setCanBeConsumed(false);
            config.setCanBeResolved(true);
            config.setDescription("NPlusOne Java agent for test JVMs");
        });

        //region add dependencies
        Property<String> nplusoneVersion = extension.getNplusoneVersion();
        project.getDependencies().addProvider(testAgentConfig.getName(),
                nplusoneVersion.map(version -> BuildId.GROUP.getValue() + ":" + BuildId.TEST_JAVAAGENT_ARTIFACT.getValue() + ":" + version));
        //endregion

        Provider<Boolean> disabledBySystemProperty = project.getProviders()
                .systemProperty(ConfigProperty.TEST_AGENT_DISABLED.getName())
                .map(Boolean::parseBoolean)
                .orElse(false);

        project.getTasks().withType(Test.class).configureEach(test -> {
            //region add argLine arguments provider
            NPlusOneAgentArguments arguments = project.getObjects().newInstance(NPlusOneAgentArguments.class);
            arguments.getEnabled().set(extension.getEnabled()
                    .zip(disabledBySystemProperty, (enabled, disabled) -> enabled && !disabled));
            arguments.getAgentClasspath().from(testAgentConfig);
            test.getJvmArgumentProviders().add(arguments);
            //endregion

            //region set constant-value system properties
            Map<String, Object> sysProps = test.getSystemProperties();
            String exporterValue = OTel.EXPORTER_VALUE.getValue();
            sysProps.putIfAbsent(OTel.TRACES_EXPORTER_PROPERTY.getValue(), exporterValue);
            sysProps.putIfAbsent(OTel.METRICS_EXPORTER_PROPERTY.getValue(), exporterValue);
            sysProps.putIfAbsent(OTel.LOGS_EXPORTER_PROPERTY.getValue(), exporterValue);
        });

        //region set build-file-input-dependent system properties
        // make sure Gradle evaluates the nplusone extension first, since we'll read its values
        project.afterEvaluate(__ -> project.getTasks().withType(Test.class).configureEach(test -> {
            if(extension.getApplicationPackagePrefixes().isPresent()) {
                test.systemProperty(ConfigProperty.AGENT_EXTENSION_STACKTRACE_APP_PACKAGE_PREFIXES.getName(),
                        extension.getApplicationPackagePrefixes().get());
            }
            boolean disabled = !extension.getEnabled().get() || disabledBySystemProperty.get();
            test.systemProperty(ConfigProperty.TEST_AGENT_DISABLED.getName(), disabled);
        }));
        //endregion
    }
}
