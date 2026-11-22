package com.goosb.nplusone.maven;

import static com.goosb.nplusone.common.StringsUtil.isBlank;

import org.apache.maven.execution.AbstractExecutionListener;
import org.apache.maven.execution.ExecutionEvent;
import org.apache.maven.execution.ExecutionListener;
import org.apache.maven.execution.MavenSession;
import org.apache.maven.plugin.MojoExecution;
import org.apache.maven.project.MavenProject;
import org.codehaus.plexus.util.xml.Xpp3Dom;

final class AppendNPlusOneTestAgentToTestJvmArgLineListener extends AbstractExecutionListener {

    private static final String PREPARED = AppendNPlusOneTestAgentToTestJvmArgLineListener.class.getName() + ".prepared";
    private static final String ARG_LINE = "argLine";

    private final ExecutionListener delegate;

    private AppendNPlusOneTestAgentToTestJvmArgLineListener(
            ExecutionListener delegate) {
        this.delegate = delegate != null ? delegate : new AbstractExecutionListener() {

        };
    }

    static void install(
            MavenSession session,
            MavenProject project) {
        project.setContextValue(PREPARED, Boolean.TRUE);
        // parallel reactor projects share a request; preserve the existing listener
        synchronized(session.getRequest()) {
            ExecutionListener current = session.getRequest().getExecutionListener();
            if(!(current instanceof AppendNPlusOneTestAgentToTestJvmArgLineListener)) {
                session.getRequest().setExecutionListener(new AppendNPlusOneTestAgentToTestJvmArgLineListener(current));
            }
        }
    }

    @Override
    public void mojoStarted(
            ExecutionEvent event) {
        delegate.mojoStarted(event);

        MavenSession session = event.getSession();
        MavenProject project = event.getProject();
        MojoExecution execution = event.getMojoExecution();
        if(shouldAdjustArgLine(project, execution)) {
            addNPlusOneTestJavaAgentToArgLineDom(session, project, execution);
        }
    }

    private static boolean shouldAdjustArgLine(
            MavenProject project,
            MojoExecution execution) {
        boolean listenerIsPrepared = Boolean.TRUE.equals(project.getContextValue(PREPARED));
        if(!listenerIsPrepared) {
            return false;
        }

        boolean isPluginExecution = "org.apache.maven.plugins".equals(execution.getGroupId());
        if(!isPluginExecution) {
            return false;
        }

        boolean isSurefireTestRun = "maven-surefire-plugin".equals(execution.getArtifactId())
                && "test".equals(execution.getGoal());
        boolean isFailsafeTestRun = "maven-failsafe-plugin".equals(execution.getArtifactId())
                && "integration-test".equals(execution.getGoal());
        return isSurefireTestRun || isFailsafeTestRun;
    }

    private static void addNPlusOneTestJavaAgentToArgLineDom(
            MavenSession session,
            MavenProject project,
            MojoExecution execution) {
        Xpp3Dom configDom = execution.getConfiguration();
        if(configDom == null) {
            configDom = new Xpp3Dom("configuration");
            execution.setConfiguration(configDom);
        }

        Xpp3Dom argLineDom = configDom.getChild(ARG_LINE);
        if(argLineDom == null) {
            argLineDom = new Xpp3Dom(ARG_LINE);
            configDom.addChild(argLineDom);
        }

        String existingArgLine = argLineDom.getValue();
        if(isBlank(existingArgLine) || "${argLine}".equals(existingArgLine)) {
            existingArgLine = session.getUserProperties().getProperty(ARG_LINE, project.getProperties().getProperty(ARG_LINE, ""));
        }

        String agentArguments = project.getProperties().getProperty(AppendNPlusOneTestAgentToTestJvmArgLineMojo.AGENT_ARG_LINE);
        if(existingArgLine.contains("@{" + AppendNPlusOneTestAgentToTestJvmArgLineMojo.AGENT_ARG_LINE + "}")
                || existingArgLine.contains("${" + AppendNPlusOneTestAgentToTestJvmArgLineMojo.AGENT_ARG_LINE + "}")
                || existingArgLine.contains(agentArguments)) {
            return; // if the client already has a POM configured that adds the agent to the argLine, then no need to change it
        }

        argLineDom.setValue(agentArguments + (existingArgLine.isBlank() ? "" : " " + existingArgLine));
    }

    @Override
    public void projectDiscoveryStarted(
            ExecutionEvent event) {
        delegate.projectDiscoveryStarted(event);
    }

    @Override
    public void sessionStarted(
            ExecutionEvent event) {
        delegate.sessionStarted(event);
    }

    @Override
    public void sessionEnded(
            ExecutionEvent event) {
        delegate.sessionEnded(event);
    }

    @Override
    public void projectSkipped(
            ExecutionEvent event) {
        delegate.projectSkipped(event);
    }

    @Override
    public void projectStarted(
            ExecutionEvent event) {
        delegate.projectStarted(event);
    }

    @Override
    public void projectSucceeded(
            ExecutionEvent event) {
        delegate.projectSucceeded(event);
    }

    @Override
    public void projectFailed(
            ExecutionEvent event) {
        delegate.projectFailed(event);
    }

    @Override
    public void mojoSkipped(
            ExecutionEvent event) {
        delegate.mojoSkipped(event);
    }

    @Override
    public void mojoSucceeded(
            ExecutionEvent event) {
        delegate.mojoSucceeded(event);
    }

    @Override
    public void mojoFailed(
            ExecutionEvent event) {
        delegate.mojoFailed(event);
    }

    @Override
    public void forkStarted(
            ExecutionEvent event) {
        delegate.forkStarted(event);
    }

    @Override
    public void forkSucceeded(
            ExecutionEvent event) {
        delegate.forkSucceeded(event);
    }

    @Override
    public void forkFailed(
            ExecutionEvent event) {
        delegate.forkFailed(event);
    }

    @Override
    public void forkedProjectStarted(
            ExecutionEvent event) {
        delegate.forkedProjectStarted(event);
    }

    @Override
    public void forkedProjectSucceeded(
            ExecutionEvent event) {
        delegate.forkedProjectSucceeded(event);
    }

    @Override
    public void forkedProjectFailed(
            ExecutionEvent event) {
        delegate.forkedProjectFailed(event);
    }
}
