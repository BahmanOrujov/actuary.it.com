from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
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
