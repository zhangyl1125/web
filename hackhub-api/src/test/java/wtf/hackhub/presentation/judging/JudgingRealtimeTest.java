package wtf.hackhub.presentation.judging;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import wtf.hackhub.application.judging.SubmitJudgeScoreUseCase;
import wtf.hackhub.domain.JudgeScore;
import wtf.hackhub.presentation.websocket.HackathonEventPublisher;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.*;

class JudgingRealtimeTest {
	private final UUID award = UUID.randomUUID(), idea = UUID.randomUUID(), judge = UUID.randomUUID();
	private final SubmitJudgeScoreUseCase submit = mock(SubmitJudgeScoreUseCase.class);
	private final SimpMessagingTemplate messaging = mock(SimpMessagingTemplate.class);
	private JudgingController controller;

	@BeforeEach
	void setUp() {
		controller = new JudgingController(null, null, null, submit, null, null, null,
				new HackathonEventPublisher(messaging));
	}

	@Test
	void completed_evaluation_notifies_once_after_save_without_broadcasting_ratings() {
		var criterion = UUID.randomUUID();
		when(submit.submitEvaluation(eq(award), eq(idea), eq(judge), any(), eq("Private comment")))
				.thenReturn(List.of(new JudgeScore(award, idea, judge, criterion, 6, "Private comment")));
		controller.submitEvaluation(award, new JudgingController.EvaluationRequest(idea,
				List.of(new JudgingController.EvaluationCriterion(criterion, 6)), "Private comment"), judge);
		var order = inOrder(submit, messaging);
		order.verify(submit).submitEvaluation(eq(award), eq(idea), eq(judge), any(), eq("Private comment"));
		order.verify(messaging).convertAndSend("/topic/hackathon." + award + ".updates",
				Map.of("event", "JUDGE_SCORES_UPDATED", "ideaId", idea));
		verifyNoMoreInteractions(messaging);
	}

	@Test
	void failed_evaluation_does_not_notify() {
		when(submit.submitEvaluation(eq(award), eq(idea), eq(judge), any(), any()))
				.thenThrow(new IllegalArgumentException("Incomplete evaluation"));
		assertThatThrownBy(() -> controller.submitEvaluation(award,
				new JudgingController.EvaluationRequest(idea, List.of(), null), judge))
				.isInstanceOf(IllegalArgumentException.class);
		verifyNoInteractions(messaging);
	}

	@Test
	void individual_score_update_and_withdrawal_both_notify() {
		when(submit.execute(award, idea, judge, null, 7, null))
				.thenReturn(new JudgeScore(award, idea, judge, null, 7, null));
		controller.submitScore(award, new JudgingController.SubmitScoreRequest(idea, null, 7, null), judge);
		controller.deleteEvaluation(award, idea, judge);
		var order = inOrder(submit, messaging);
		order.verify(submit).execute(award, idea, judge, null, 7, null);
		order.verify(messaging).convertAndSend("/topic/hackathon." + award + ".updates",
				Map.of("event", "JUDGE_SCORES_UPDATED", "ideaId", idea));
		order.verify(submit).deleteEvaluation(award, idea, judge);
		order.verify(messaging).convertAndSend("/topic/hackathon." + award + ".updates",
				Map.of("event", "JUDGE_SCORES_UPDATED", "ideaId", idea));
	}
}
