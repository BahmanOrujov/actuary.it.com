from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from django.core.mail import send_mail
from django.conf import settings
import re
import threading
import json
import os
import requests
from .engine import evaluate_single_policy
from .models import BlogPost

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
    # Check if a custom Webhook URL is set to bypass Render's SMTP port block (e.g. Google Apps Script)
    webhook_url = getattr(settings, 'FEEDBACK_WEBHOOK_URL', os.environ.get('FEEDBACK_WEBHOOK_URL'))
    
    if webhook_url:
        try:
            payload = {
                "email": from_email,
                "message": message,
                "subject": subject
            }
            headers = {'Content-Type': 'application/json', 'User-Agent': 'Mozilla/5.0'}
            # requests handles 302 redirects automatically and correctly redirects the POST payload
            response = requests.post(webhook_url, json=payload, headers=headers, timeout=10)
            print(f"Background email via Webhook sent successfully! Status: {response.status_code}, Response: {response.text}", flush=True)
            return
        except Exception as webhook_err:
            print(f"Background Webhook delivery failed: {webhook_err}", flush=True)
            # Proceed to SMTP fallback if webhook fails
            
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

class BlogListAPIView(APIView):
    def get(self, request, *args, **kwargs):
        try:
            posts = BlogPost.objects.all()
            data = []
            for post in posts:
                data.append({
                    "id": post.id,
                    "icon": post.icon,
                    "readTime": post.read_time,
                    "title": {
                        "AZ": post.title_az,
                        "EN": post.title_en
                    },
                    "excerpt": {
                        "AZ": post.excerpt_az,
                        "EN": post.excerpt_en
                    },
                    "date": {
                        "AZ": post.date_az,
                        "EN": post.date_en
                    },
                    "sourceUrl": post.source_url
                })
            return Response({"status": "success", "data": data}, status=status.HTTP_200_OK)
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

class BlogDetailAPIView(APIView):
    def get(self, request, pk, *args, **kwargs):
        try:
            post = BlogPost.objects.get(pk=pk)
            data = {
                "id": post.id,
                "title": {
                    "AZ": post.title_az,
                    "EN": post.title_en
                },
                "content": {
                    "AZ": post.content_az,
                    "EN": post.content_en
                },
                "sourceUrl": post.source_url
            }
            return Response({"status": "success", "data": data}, status=status.HTTP_200_OK)
        except BlogPost.DoesNotExist:
            return Response({"status": "error", "message": "Blog post not found."}, status=status.HTTP_404_NOT_FOUND)
        except Exception as e:
            return Response({"status": "error", "message": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


