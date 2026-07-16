from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.mail import send_mail
from django.conf import settings
import re
import threading
from .engine import evaluate_single_policy

class ValuationAPIView(APIView):
    def get(self, request, *args, **kwargs):
        return Response({"status": "healthy"}, status=status.HTTP_200_OK)

    def post(self, request, *args, **kwargs):
        try:
            params_data = request.data.get('params', {})
            policy_data = request.data.get('policy', {})
            
            # evaluate_single_policy expects dictionaries mapping to ValuationParameters and PolicyRecord
            result = evaluate_single_policy(params_data, policy_data)
            
            return Response({"status": "success", "data": result}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=status.HTTP_400_BAD_REQUEST)

def async_send_mail(subject, message, from_email, recipient_list):
    try:
        send_mail(
            subject=subject,
            message=message,
            from_email=from_email,
            recipient_list=recipient_list,
            fail_silently=False,
        )
        print("Background email sent successfully!", flush=True)
    except Exception as e:
        # Log error to console, do not disrupt request flow
        print(f"Background email delivery failed: {e}", flush=True)

class FeedbackAPIView(APIView):
    def post(self, request, *args, **kwargs):
        try:
            email = request.data.get('email', '').strip()
            message = request.data.get('message', '').strip()
            
            if not email:
                return Response({"status": "error", "message": "Email is required."}, status=status.HTTP_400_BAD_REQUEST)
            
            if not message:
                return Response({"status": "error", "message": "Feedback message is required."}, status=status.HTTP_400_BAD_REQUEST)
            
            # Real email address format check using regex
            email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
            if not re.match(email_regex, email):
                return Response({"status": "error", "message": "Invalid email address format."}, status=status.HTTP_400_BAD_REQUEST)
            
            subject = f"ARPP Platform Feedback from {email}"
            email_body = f"Feedback Sender: {email}\n\nFeedback Message:\n{message}"
            from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', 'noreply@actuary-it-com.com')
            
            # Run send_mail in a background thread to return response instantly
            email_thread = threading.Thread(
                target=async_send_mail,
                args=(subject, email_body, from_email, ['bahmanoorujov@gmail.com'])
            )
            email_thread.daemon = True
            email_thread.start()
            
            return Response({"status": "success", "message": "Feedback submitted successfully."}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


