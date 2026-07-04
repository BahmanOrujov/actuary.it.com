from django.urls import path
from .views import ValuationAPIView

urlpatterns = [
    path('valuation/', ValuationAPIView.as_view(), name='valuation'),
]
