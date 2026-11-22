package com.goosb.nplusone.maven;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import com.goosb.nplusone.common.message.Info;
import com.goosb.nplusone.common.ConfigProperty;
import com.goosb.nplusone.common.Version;
import com.goosb.nplusone.common.plugin.BuildId;
import com.goosb.nplusone.common.plugin.OTel;

import org.apache.maven.model.Dependency;
import org.apache.maven.execution.MavenSession;
import org.apache.maven.plugin.AbstractMojo;
import org.apache.maven.plugin.MojoExecutionException;
import org.apache.maven.plugins.annotations.LifecyclePhase;
import org.apache.maven.plugins.annotations.Mojo;
import org.apache.maven.plugins.annotations.Parameter;
import org.apache.maven.project.MavenProject;
import org.eclipse.aether.RepositorySystem;
import org.eclipse.aether.RepositorySystemSession;
import org.eclipse.aether.artifact.DefaultArtifact;
import org.eclipse.aether.repository.RemoteRepository;
import org.eclipse.aether.resolution.ArtifactRequest;
import org.eclipse.aether.resolution.ArtifactResolutionException;

import javax.inject.Inject;

import java.io.File;
import java.util.List;

/**
 * This Maven plugin goal adjusts a client's Maven configuration so that the NPlusOne test Java agent is added to the argument line of the
 * JVM that runs a client's tests.
 * <p>
 * It does so, by:
 * <ol>
 *     <li>Resolving the NPlusOne test Java agent artifact (from a local Maven repos, Maven Central or any other configured repository)
 *     <li>Storing the file path to this agent in a Maven project property. This property is then read by the
 *     {@link AppendNPlusOneTestAgentToTestJvmArgLineListener}, which adjusts the configured arg line of the Maven Surefire or Failsafe
 *     plugin (which run the tests). This indirect approach is needed to reliably assure that the test JVM starts with the Java agent
 *     appended to whichever arg line a client already has configured for these plugins in their POM.
 * </ol>
 */
@Mojo(name = "prepare-agent", defaultPhase = LifecyclePhase.INITIALIZE, threadSafe = true)
public class AppendNPlusOneTestAgentToTestJvmArgLineMojo extends AbstractMojo {

    static final String AGENT_ARG_LINE = "nplusone.agentArgLine";

    @Inject
    private RepositorySystem repositorySystem;

    @Parameter(defaultValue = "${session}", readonly = true, required = true)
    private MavenSession session;

    @Parameter(defaultValue = "${project}", readonly = true, required = true)
    private MavenProject project;

    @Parameter(defaultValue = "${repositorySystemSession}", readonly = true, required = true)
    private RepositorySystemSession repositorySession;

    @Parameter(defaultValue = "${project.remoteProjectRepositories}", readonly = true, required = true)
    private List<RemoteRepository> repositories;

    @Parameter(property = "nplusone.version")
    private String nplusoneVersion;

    @Parameter(property = "nplusone.enabled", defaultValue = "true")
    private boolean enabled;

    @Parameter(property = "nplusone.applicationPackagePrefixes")
    private String applicationPackagePrefixes;

    @Override
    public void execute() throws MojoExecutionException {
        String version = validateNPlusOneVersion();

        if(!enabled) {
            project.getProperties().setProperty(AGENT_ARG_LINE, "-D" + ConfigProperty.TEST_AGENT_DISABLED.getName() + "=true");
            AppendNPlusOneTestAgentToTestJvmArgLineListener.install(session, project);
            getLog().info(Info.MAVEN_INSTRUMENTATION_DISABLED.getMessage());
            return;
        }

        String testAgentFilePath = resolveNPlusOneTestJavaAgentPath(version);
        project.getProperties().setProperty(AGENT_ARG_LINE, createNewArgLineArgument(testAgentFilePath));
        AppendNPlusOneTestAgentToTestJvmArgLineListener.install(session, project);
        getLog().info(Info.MAVEN_TEST_AGENT_CONFIGURED.getMessage());
    }

    private String validateNPlusOneVersion() throws MojoExecutionException {
        String version = nplusoneVersion == null ? Version.CURRENT.getValue() : nplusoneVersion.trim();
        if(isBlank(version)) {
            String postFix = enabled ? "" : " This is required even with nplusone.enabled=false.";
            throw new MojoExecutionException("Set nplusone.version to the NPlusOne artifact version." + postFix);
        }

        List<Dependency> nPlusOneJUnitDependencies = project.getDependencies().stream()
                .filter(dependency -> BuildId.GROUP.getValue().equals(dependency.getGroupId())
                        && (BuildId.TEST_JUNIT4_ARTIFACT.getValue().equals(dependency.getArtifactId())
                        || BuildId.TEST_JUNIT_JUPITER_ARTIFACT.getValue().equals(dependency.getArtifactId())))
                .toList();

        if(nPlusOneJUnitDependencies.isEmpty()) {
            throw new MojoExecutionException("Add "
                    + BuildId.GROUP.getValue() + ":" + BuildId.TEST_JUNIT4_ARTIFACT.getValue() + ":" + version
                    + " or "
                    + BuildId.GROUP.getValue() + ":" + BuildId.TEST_JUNIT_JUPITER_ARTIFACT.getValue() + ":" + version
                    + " as a test dependency in your POM.");
        }

        for(Dependency dependency : nPlusOneJUnitDependencies) {
            if(!version.equals(dependency.getVersion())) {
                throw new MojoExecutionException("nplusone.version is set to %s, but the pom contains %s with version %s"
                        .formatted(version, dependency.getArtifactId(), dependency.getVersion()));
            }
        }

        return version;
    }

    private String resolveNPlusOneTestJavaAgentPath(
            String version) throws MojoExecutionException {
        try {
            ArtifactRequest request = new ArtifactRequest();
            request.setArtifact(new DefaultArtifact(BuildId.GROUP.getValue(), BuildId.TEST_JAVAAGENT_ARTIFACT.getValue(), "jar", version));
            request.setRepositories(repositories);

            File nPlusOneTestAgentFile = repositorySystem.resolveArtifact(repositorySession, request).getArtifact().getFile();
            return nPlusOneTestAgentFile.getAbsolutePath();
        }
        catch(ArtifactResolutionException e) {
            throw new MojoExecutionException("Unable to resolve the NPlusOne test Java agent, version: " + version, e);
        }
    }

    private String createNewArgLineArgument(
            String testAgentFilePath) {
        String argument = "-javaagent:" + quoteIfNeeded(testAgentFilePath)
                + " -D" + OTel.TRACES_EXPORTER_PROPERTY.getValue() + "=" + OTel.EXPORTER_VALUE.getValue()
                + " -D" + OTel.METRICS_EXPORTER_PROPERTY.getValue() + "=" + OTel.EXPORTER_VALUE.getValue()
                + " -D" + OTel.LOGS_EXPORTER_PROPERTY.getValue() + "=" + OTel.EXPORTER_VALUE.getValue()
                + " -D" + ConfigProperty.TEST_AGENT_DISABLED.getName() + "=false";

        if(isBlank(applicationPackagePrefixes)) {
            return argument;
        }

        return argument + " -D" + ConfigProperty.AGENT_EXTENSION_STACKTRACE_APP_PACKAGE_PREFIXES.getName() + "="
                + quoteIfNeeded(applicationPackagePrefixes);
    }

    private static String quoteIfNeeded(
            String value) {
        return value.contains(" ") ? "\"" + value + "\"" : value;
    }
}
