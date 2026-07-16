from django.urls import path
from .views import ValuationAPIView, FeedbackAPIView

urlpatterns = [
    path('valuation/', ValuationAPIView.as_view(), name='valuation'),
    path('feedback/', FeedbackAPIView.as_view(), name='feedback'),
]
